import os
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
from dotenv import load_dotenv
import fitz  # PyMuPDF

# Load .env variables
load_dotenv()
api_key = os.getenv("OPENAI_API_KEY")
client = OpenAI(api_key=api_key)

app = FastAPI()

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    text = ""
    for page in doc:
        text += page.get_text()
    return text.strip()

@app.post("/generate")
async def generate_email_response(
    email_text: str = Form(...),
    pdf: UploadFile = File(...)
):
    pdf_bytes = await pdf.read()
    pdf_text = extract_text_from_pdf(pdf_bytes)

    prompt = f"""
You are a professional email responder. Write a thoughtful and clear reply to the following incoming email.
Include context from the related PDF document.

Incoming Email:
{email_text}

PDF Summary:
{pdf_text}

Your Reply:
"""

    try:
        response = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
        )
        reply_text = response.choices[0].message.content.strip()
    except Exception as e:
        return {"response": f"Error: {str(e)}"}

    return {"response": reply_text}
