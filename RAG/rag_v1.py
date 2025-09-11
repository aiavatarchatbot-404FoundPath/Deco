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

def ai_emotion_analyser(query):
    negative_words = ["anxious", "sad", "unhappy", "miserable", "stressed", "upset", "worthless", "horrible", "awful", "bad"]
    positive_words = ["happy", "great", "amazing", "fantastic", "confident", "relaxed", "good"]

    # Initializes the score when checking for emotions in the user query
    score = 0 
    
    for word in query:
        if word in negative_words:
            score -= 1
        else if word in positive_words:
            score += 1
        else:
            score = 0

    if score < 0:
        return "Negative"
    else if score == 0:
        return "Neutral"
    else:
        return "Positive"

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
