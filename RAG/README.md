# RAG Model (Local Setup)

This repository contains a **Retrieval-Augmented Generation (RAG) model** powered by **OpenAI’s `gpt-5-nano`**.  
Currently, the model can only be run in a **local environment**.

---

## Getting Started

To run the model, you need to provide two inputs in the code:

1. **API Key**  
   A ChatGPT API key is a unique, secret code that allows your application to programmatically access OpenAI’s language models.

2. **CSV_PATH**  
   The file path to the CSV file stored in your local environment.

### Optional Input
The code is designed to handle **both CSV chunks and PDFs**:
- To use PDFs directly, set:
  ```python
  USE_CSV_CHUNKS = False
  PDF_FOLDER = "<path_to_pdf_folder>"


## Modifying the Model

You can customize the model’s behavior by editing the `ask()` function in the code.

### Adjusting Response Style
The `message` prompt inside `ask()` can be changed to modify the **tone** and **control how responses are generated**.  
Example:
```text
"Prioritize the provided context when answering. If the context is incomplete, you may also use your general knowledge (limit to 3 sentences)."

For more specific responses, it is recommended to add domain-specific information to your data chunks.

