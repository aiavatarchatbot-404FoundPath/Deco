import os
import faiss
import numpy as np
from pypdf import PdfReader
from openai import OpenAI

# OPTIONAL (only if using CSV word chunks)
try:
    import pandas as pd
except ImportError:
    pd = None  # won't be needed if you use PDFs

# =========================
# Config: choose ONE input
# =========================
USE_CSV_CHUNKS = True   # True = load from Excel; False = parse PDFs
CSV_PATH = ""  # columns: file, chunk_id, content

PDF_FOLDER = ""

# --- OpenAI ---
# Prefer env var: export OPENAI_API_KEY="..."
client = OpenAI(api_key="")  # replace with your actual key


# --- Step 1a: Load PDFs ---
def load_pdfs(folder):
    texts = []
    for file in os.listdir(folder):
        if file.lower().endswith(".pdf"):
            reader = PdfReader(os.path.join(folder, file))
            text = ""
            for page in reader.pages:
                try:
                    t = page.extract_text()
                    if t:
                        text += t + "\n"
                except Exception:
                    pass
            if text.strip():
                texts.append(text)
    return texts

# --- Step 1b: Load chunks from CSV (file,chunk_id,content) ---
def load_chunks_from_csv(csv_path):
    df = pd.read_csv(csv_path)
    required = {"file", "chunk_id", "content"}
    if not required.issubset(df.columns):
        raise ValueError(f"CSV must contain columns: {required}")
    # return just the chunk texts
    return [str(c) for c in df["content"].fillna("") if str(c).strip()]

# --- Step 2: Chunk text (only used for PDFs) ---
def chunk_text(text, size=500, overlap=50):
    words = text.split()
    step = max(1, size - overlap)
    return [" ".join(words[i:i+size]) for i in range(0, len(words), step)]

# --- Step 3: Embed chunks (with batching for stability) ---
def embed(texts, batch_size=128):
    out = []
    for i in range(0, len(texts), batch_size):
        batch = texts[i:i+batch_size]
        resp = client.embeddings.create(model="text-embedding-3-small", input=batch)
        out.extend([d.embedding for d in resp.data])
    return out

# -------------------------
# Build corpus (chunks)
# -------------------------
if USE_CSV_CHUNKS:
    print(f" Using chunks from CSV: {CSV_PATH}")
    chunks = load_chunks_from_csv(CSV_PATH)
else:
    print(" Parsing PDFs and creating chunks...")
    docs = load_pdfs(PDF_FOLDER)
    chunks = [c for doc in docs for c in chunk_text(doc)]

if not chunks:
    raise SystemExit("No text chunks found. Check your input settings/paths.")

print(f"✅ Loaded {len(chunks)} text chunks")

# -------------------------
# Embeddings + FAISS
# -------------------------
print("Creating embeddings...")
embeddings = embed(chunks)
dimension = len(embeddings[0])

index = faiss.IndexFlatL2(dimension)
index.add(np.array(embeddings, dtype="float32"))

# -------------------------
# Retrieval
# -------------------------
def retrieve(query, k=3):
    q_emb = embed([query])[0]
    D, I = index.search(np.array([q_emb], dtype="float32"), k)
    return [chunks[i] for i in I[0]]

# -------------------------
# Chatbot
# -------------------------
def ask(query):
    context = "\n".join(retrieve(query))
    resp = client.chat.completions.create(
        model="gpt-5-nano",
        # This part is how to change the tone and control the responses of the model
        messages=[
            {"role":"system","content":"You are a helpful, supportive chatbot for young people in Queensland's youth justice system. Prioritise the provided context when answering. If the context is incomplete, you may also use your general knowledge, at max 3 sentences in this case. Be concise and empathetic."},
            {"role":"user","content": f"Context:\n{context}\n\nQuestion: {query}"}
        ]
        
    )
    return resp.choices[0].message.content

# For analysing the user's emotion
negative_words = [
    # Emotions & Feelings
    "sad", "unhappy", "depressed", "lonely", "miserable",
    "anxious", "stressed", "overwhelmed", "hopeless", "worthless",

    # Judgments / Self-talk
    "stupid", "dumb", "failure", "useless", "weak",
    "horrible", "awful", "bad", "terrible", "disgusting",

    # Conflict / Anger
    "hate", "angry", "mad", "frustrated", "annoyed",
    "upset", "pissed", "furious", "jealous", "resent",

    # Fear / Worry
    "scared", "afraid", "worried", "nervous", "insecure",
    "panicked", "trapped", "stuck", "danger"
]

positive_words = [
    # Emotions & Feelings
    "happy", "joyful", "content", "cheerful", "excited",
    "relaxed", "calm", "peaceful", "grateful", "hopeful",

    # Self-talk / Confidence
    "confident", "strong", "capable", "smart", "worthy",
    "successful", "brave", "resilient", "motivated", "proud",

    # Praise / Goodness
    "amazing", "fantastic", "wonderful", "great", "awesome",
    "excellent", "beautiful", "kind", "positive", "good",

    # Love / Connection
    "love", "caring", "friendly", "supportive", "compassionate",
    "generous", "loyal", "respectful", "trusting", "connected"
]

happy_emojis = {"😊", "😃", "😄", "😁", "🥳", "🥰", "😂", "😎", "🤠"}
sad_emojis   = {"😢", "😭", "😞", "☹️", "😔", "🙁", "😩", "😡", "😠"}

def ai_emotion_analyser(query):
    # Case 1: Checks emotion based on capitalization of user's query
    if query.isupper():
        if any(word in query.lower() for word in negative_words):
            return "Negative"
        elif any(word in query.lower() for word in positive_words):
            return "Positive"
        else:
            return "Neutral"

    # Case 2: Detects whether there are any emojis used in user's query
    if any(emoji in query for emoji in happy_emojis):
        return "Positive"
    elif any(emoji in query for emoji in sad_emojis):
        return "Negative"
    else:
        return "Neutral"

    # Initializes the count of negative and positive words when checking for emotions in the user query
    count_neg = 0 
    count_pos = 0
        

    # Case 3: Count is updated based on whether a negative or positive word is detected in the query
    for word in query.split():
        if word in negative_words:
            count_neg += 1
        elif word in positive_words:
            count_pos += 1

    # Returns the user's emotion based on the number of negative and positive words in the query
    if count_neg < count_pos:
        return "Positive"
    elif count_neg > count_pos:
        return "Negative"
    else:
        return "Neutral"

def ai_tier_classifier(query, emotion):
    # Intensity is used to measure how strong of an emotion the user is experiencing
    intensity = 0

    # Calculates level of intensity based on capitalisation, punctuation, words and emojis 
    if emotion == "Negative":
        if query.isupper():
            intensity += 2

        for word in query.split():
            if word in ["suicide", "kill", "die", "death"]:
                intensity += 10

            intensity += query.count("!")
            intensity += sum(query.count(e) for e in sad_emojis)
            intensity += sum(query.count(word) for word in negative_words)
    else:
        return None # If emotion is not negative

    # Classifies tier based on level of intensity
    if intensity <= 2:
        tier = "Low"
    elif intensity <= 5:
        tier = "Moderate"
    elif intensity <= 8:
        tier = "High"
    else:
        tier = "Imminent Danger"

    return tier
        
# -------------------------
# Run Chat Loop
# -------------------------
print("\n 🤖 “Hey, I’m Adam. I can share information about youth justice, your rights, and where to find support. What would you like to talk about?” (Type 'exit' to quit)\n")
while True:
    user_q = input("You: ")
    if user_q.lower() in ["exit", "quit"]:
        print("👋 Goodbye!")
        break
    try:
        answer = ask(user_q)
        print(f"Bot: {answer}\n")
    except Exception as e:
        print(f"⚠️ Error: {e}\n")
