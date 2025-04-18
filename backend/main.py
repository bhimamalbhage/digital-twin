import os
import base64
import fitz  # PyMuPDF
from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File, Form, Request
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
import base64 as b64

# Load .env variables
load_dotenv()
api_key = os.getenv("OPENAI_API_KEY")
client = OpenAI(api_key=api_key)

# Gmail API Setup
gmail_token = os.getenv("GMAIL_ACCESS_TOKEN")
gmail_refresh_token = os.getenv("GMAIL_REFRESH_TOKEN")
gmail_client_id = os.getenv("GMAIL_CLIENT_ID")
gmail_client_secret = os.getenv("GMAIL_CLIENT_SECRET")

gmail_creds = Credentials(
    token=gmail_token,
    refresh_token=gmail_refresh_token,
    token_uri="https://oauth2.googleapis.com/token",
    client_id=gmail_client_id,
    client_secret=gmail_client_secret,
    scopes=["https://www.googleapis.com/auth/gmail.modify"]
)

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

def create_email_raw(to: str, subject: str, body: str) -> str:
    message = f"To: {to}\r\nSubject: {subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n{body}"
    raw = base64.urlsafe_b64encode(message.encode("utf-8")).decode("utf-8")
    return raw

@app.get("/emails")
async def fetch_latest_emails():
    try:
        service = build("gmail", "v1", credentials=gmail_creds)
        results = service.users().messages().list(userId="me", labelIds=["INBOX"], maxResults=5, q="is:unread").execute()
        messages = results.get("messages", [])

        emails = []
        for msg in messages:
            msg_data = service.users().messages().get(userId="me", id=msg["id"]).execute()
            payload = msg_data.get("payload", {})
            headers = payload.get("headers", [])
            subject = next((h["value"] for h in headers if h["name"] == "Subject"), "(No Subject)")
            sender = next((h["value"] for h in headers if h["name"] == "From"), "Unknown")
            snippet = msg_data.get("snippet", "")
            emails.append({"id": msg["id"], "subject": subject, "from": sender, "snippet": snippet})

        return {"emails": emails}

    except Exception as e:
        return {"error": str(e)}

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

@app.get("/generate_with_pdf")
async def generate_response_using_gmail_data(id: str):
    try:
        service = build("gmail", "v1", credentials=gmail_creds)
        msg = service.users().messages().get(userId="me", id=id).execute()

        snippet = msg.get("snippet", "")
        parts = msg.get("payload", {}).get("parts", [])
        pdf_data = None

        for part in parts:
            if part.get("filename", "").endswith(".pdf"):
                attach_id = part.get("body", {}).get("attachmentId")
                if attach_id:
                    attachment = service.users().messages().attachments().get(
                        userId="me", messageId=id, id=attach_id
                    ).execute()
                    pdf_data = b64.urlsafe_b64decode(attachment.get("data", ""))
                    break

        pdf_text = extract_text_from_pdf(pdf_data) if pdf_data else ""

        prompt = f"""
You are a digital twin AI assistant that writes professional email replies on my behalf, mimicking my unique writing style. 
Use available context from the email thread and, if provided, any PDF attachments to craft a thoughtful, informed, and clear reply.

Incoming Email:
{snippet}

"""
        if pdf_text:
            prompt += f"PDF Summary:\n{pdf_text}\n\n"

        prompt += "Your Reply:\n"

        response = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
        )
        reply_text = response.choices[0].message.content.strip()
        return {"response": reply_text}

    except Exception as e:
        return {"response": f"Error: {str(e)}"}
    
@app.post("/send")
async def send_email(to: str = Form(...), subject: str = Form(...), body: str = Form(...)):
    try:
        service = build("gmail", "v1", credentials=gmail_creds)
        raw = create_email_raw(to, subject, body)
        message = {"raw": raw}
        send_result = service.users().messages().send(userId="me", body=message).execute()
        return {"status": "sent", "id": send_result["id"]}
    except Exception as e:
        return {"status": "error", "message": str(e)}
