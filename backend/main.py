import os
import base64
import fitz  # PyMuPDF
from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File, Form, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
import base64 as b64
from pydantic import BaseModel
from typing import Optional
from autogen import AssistantAgent, UserProxyAgent
import uvicorn
from sklearn.feature_extraction.text import TfidfVectorizer
import numpy as np
import nltk
from nltk.tokenize import sent_tokenize


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

app = FastAPI(title="Email Assistant API")

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration for AutoGen agents
CONFIG = {
    "model": "gpt-4",
    "api_key": os.getenv("OPENAI_API_KEY")
}

# User Style Profile
USER_STYLE = {
    "tone": "professional but friendly",
    "length": "concise and short",
    # "formatting": "bullet points for key items",
    # "phrases_to_avoid": ["kindly", "please be advised", "at your earliest convenience"],
    "preferred_signature": "Best regards,\nDigital Twin",
    # "key_phrases": ["I hope this helps", "Let me know if you have any questions"]
}

# Initialize Agents
writer_agent = AssistantAgent(
    name="WriterAgent",
    system_message="""You are an email response generator. Create a professional reply to the given email.
    Focus on:
    - Accurate content response
    - Clear communication
    - Appropriate level of detail
    Don't worry about specific styling - that will be handled separately.""",
    llm_config={"config_list": [CONFIG]}
)

review_agent = AssistantAgent(
    name="ReviewAgent",
    system_message=f"""You are a draft email improver. Rewrite the email draft to perfectly match these style guidelines:
    {USER_STYLE}
    Your output should:
    1. Maintain all original content meaning
    2. Apply all style rules exactly
    3. Return ONLY the final version (no commentary)
    """,
    llm_config={"config_list": [CONFIG]}
)

user_proxy = UserProxyAgent(
    name="UserProxy",
    human_input_mode="NEVER",
    max_consecutive_auto_reply=0,
    code_execution_config=False
)

nltk.download('punkt')

def summarize_text(text: str, max_sentences: int = 10) -> str:
    """
    Simple extractive summarization using TF-IDF and sentence importance scoring
    """
    sentences = sent_tokenize(text)
    if len(sentences) <= max_sentences:
        return text  # No need to summarize if already short
    
    # Create TF-IDF matrix
    vectorizer = TfidfVectorizer(stop_words='english')
    tfidf_matrix = vectorizer.fit_transform(sentences)
    
    # Calculate sentence importance scores
    sentence_scores = np.array(tfidf_matrix.sum(axis=1)).flatten()
    
    # Get top N sentences
    top_sentence_indices = sentence_scores.argsort()[-max_sentences:][::-1]
    top_sentences = [sentences[i] for i in sorted(top_sentence_indices)]
    
    return ' '.join(top_sentences)

def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    """Extract text from PDF with optional summarization for long documents"""
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    text = ""
    for page in doc:
        text += page.get_text()
    text = text.strip()
    
    # Simple word count check (approximate)
    word_count = len(text.split())
    if word_count > 1000:
        return summarize_text(text)
    return text


def create_email_raw(to: str, subject: str, body: str) -> str:
    message = f"To: {to}\r\nSubject: {subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n{body}"
    raw = base64.urlsafe_b64encode(message.encode("utf-8")).decode("utf-8")
    return raw

def generate_reply_with_agents(email_content: str, pdf_text: str = "") -> dict:
    try:
        # Reset agents
        writer_agent.reset()
        review_agent.reset()
        
        # Combine email content and PDF text for context
        full_context = f"Email to reply to:\n{email_content}"
        if pdf_text:
            full_context += f"\n\nAdditional context from attached PDF:\n{pdf_text}"
        
        # Generate content-focused draft
        user_proxy.initiate_chat(
            writer_agent,
            message=f"Please draft a content-appropriate reply to this email:\n{full_context}"
        )
        draft = writer_agent.last_message()["content"]
        
        # Get styled version
        user_proxy.initiate_chat(
            review_agent,
            message=f"Rewrite this to match our style guide:\n{draft}"
        )
        final_reply = review_agent.last_message()["content"]
        
        return {
            "draft_reply": draft,
            "review_feedback": "Automatically styled to match guidelines",
            "final_reply": final_reply
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# API Models
class EmailResponse(BaseModel):
    draft_reply: str
    review_feedback: str
    final_reply: str

# API Endpoints
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
    pdf: UploadFile = File(None)
):
    pdf_text = ""
    if pdf:
        pdf_bytes = await pdf.read()
        pdf_text = extract_text_from_pdf(pdf_bytes)

    try:
        response = generate_reply_with_agents(email_text, pdf_text)
        return response
    except Exception as e:
        return {"error": str(e)}

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

        # Create a text-only version of the thread context
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
        
        # Generate reply using AutoGen agents
        response = generate_reply_with_agents(
            email_content=f"Email Thread Context:\n{thread_text}\n\nLatest Message:\n{latest_snippet}",
            pdf_text=pdf_text
        )
        
        return {
            "response": response["final_reply"],
            "draft": response["draft_reply"],
            "thread": thread_context,
            "pdf": b64.b64encode(pdf_data).decode("utf-8") if pdf_data else "",
            "pdfFilename": pdf_filename
        }

    except Exception as e:
        return {"error": str(e)}

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

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)