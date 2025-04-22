# 📧 Digital Twin Email Assistant

An AI-powered email assistant that generates context-aware responses while maintaining your personal writing style.

## ✨ Features

| Feature | Description |
|---------|-------------|
| **AI-Powered Responses** | Generates professional email drafts using GPT-4 |
| **Style Consistency** | Maintains your preferred tone and formatting |
| **Thread Awareness** | Analyzes entire conversation history |
| **PDF Processing** | Extracts and summarizes text from attachments |
| **Gmail Integration** | Direct access to your inbox |
| **Two-Stage Generation** | Content-first, then style refinement |

## 🛠 Tech Stack

- Python + FastAPI
- OpenAI API (GPT-4)
- AutoGen (multi-agent)
- Google Gmail API
- PyMuPDF (PDF processing)
- NLTK (text summarization)
- React.js

## 🚀 Installation

### Prerequisites

- Python 3.8+
- Node.js 16+
- Gmail account with API access
- OpenAI API key

### Backend Setup

```bash
git clone https://github.com/yourusername/digital-twin-email-assistant.git
cd digital-twin-email-assistant/backend
pip install -r requirements.txt
```

Create `.env` file:
```
OPENAI_API_KEY=your_key_here
GMAIL_ACCESS_TOKEN=your_token
GMAIL_REFRESH_TOKEN=your_refresh_token
GMAIL_CLIENT_ID=your_client_id
GMAIL_CLIENT_SECRET=your_secret
```

Run backend:
```bash
uvicorn main:app --reload
```

### Frontend Setup

```bash
cd ../frontend
npm install
npm start
```

Access the application at http://localhost:3000
