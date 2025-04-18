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
            thread_id = msg_data.get("threadId")
            
            # Check for attachments
            attachments = []
            if "parts" in payload:
                for part in payload.get("parts", []):
                    if part.get("filename", "").endswith(".pdf"):
                        attach_id = part.get("body", {}).get("attachmentId")
                        if attach_id:
                            attachments.append({
                                "id": attach_id,
                                "filename": part.get("filename")
                            })
            
            emails.append({
                "id": msg["id"], 
                "subject": subject, 
                "from": sender, 
                "snippet": snippet, 
                "threadId": thread_id,
                "attachments": attachments
            })

        return {"emails": emails}

    except Exception as e:
        return {"error": str(e)}

@app.get("/email/attachment/{message_id}/{attachment_id}")
async def get_attachment(message_id: str, attachment_id: str):
    try:
        service = build("gmail", "v1", credentials=gmail_creds)
        attachment = service.users().messages().attachments().get(
            userId="me", messageId=message_id, id=attachment_id
        ).execute()
        
        pdf_data = b64.urlsafe_b64decode(attachment.get("data", ""))
        pdf_base64 = b64.b64encode(pdf_data).decode("utf-8")
        
        return {"pdf": pdf_base64}
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
You are my digital twin AI. Your task is to write a reply to the incoming email below using my unique writing style.
Incorporate any useful context from the attached PDF document and knowledge from earlier messages in the same thread (if provided).
Be concise, clear, and reflect how I normally communicate.

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

        latest_snippet = msg.get("snippet", "")
        thread_id = msg.get("threadId")

        thread = service.users().threads().get(userId="me", id=thread_id).execute()
        thread_messages = thread.get("messages", [])
        thread_context = []
        
        for m in thread_messages:
            m_data = {
                "snippet": m.get("snippet", ""),
                "id": m.get("id", ""),
                "attachments": []
            }
            
            # Extract any PDF attachments
            payload = m.get("payload", {})
            if "parts" in payload:
                for part in payload.get("parts", []):
                    if part.get("filename", "").endswith(".pdf"):
                        attach_id = part.get("body", {}).get("attachmentId")
                        if attach_id:
                            m_data["attachments"].append({
                                "id": attach_id,
                                "filename": part.get("filename", "Unknown.pdf")
                            })
            
            thread_context.append(m_data)

        # Create a text-only version of the thread context for the prompt
        thread_text = ""
        for m in thread_context:
            thread_text += f"\n---\n{m['snippet']}"

        # Get the PDF from the current message if it exists
        pdf_data = None
        pdf_filename = "Attachment.pdf"
        for part in msg.get("payload", {}).get("parts", []):
            if part.get("filename", "").endswith(".pdf"):
                attach_id = part.get("body", {}).get("attachmentId")
                pdf_filename = part.get("filename", "Attachment.pdf")
                if attach_id:
                    attachment = service.users().messages().attachments().get(
                        userId="me", messageId=id, id=attach_id
                    ).execute()
                    pdf_data = b64.urlsafe_b64decode(attachment.get("data", ""))
                    break

        pdf_text = extract_text_from_pdf(pdf_data) if pdf_data else ""
        pdf_base64 = b64.b64encode(pdf_data).decode("utf-8") if pdf_data else ""

        prompt = f"""
You are my digital twin AI. You write replies to incoming emails using my unique writing style. 
Use the full email thread for context, and also incorporate any relevant content from attached PDFs.
Your tone should be natural, thoughtful, and consistent with how I write.

Email Thread:
{thread_text}

Most Recent Message:
{latest_snippet}
"""
        if pdf_text:
            prompt += f"\nPDF Summary:\n{pdf_text}\n"

        prompt += "\nYour Reply:\n"

        response = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
        )
        reply_text = response.choices[0].message.content.strip()
        return {
            "response": reply_text,
            "thread": thread_context,
            "pdf": pdf_base64,
            "pdfFilename": pdf_filename
        }

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