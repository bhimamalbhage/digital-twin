import React, { useState, useEffect } from "react";
import { FiMail, FiPaperclip, FiSend, FiLoader, FiCheckCircle, FiXCircle } from "react-icons/fi";

export default function EmailResponder() {
  const [emails, setEmails] = useState([]);
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [editableResponse, setEditableResponse] = useState("");
  const [threadContext, setThreadContext] = useState([]);
  const [loading, setLoading] = useState(false);
  const [threadLoading, setThreadLoading] = useState(false);
  const [attachmentLoadingId, setAttachmentLoadingId] = useState(null);
  const [toast, setToast] = useState(null);
  const [usedPdfFilename, setUsedPdfFilename] = useState("");

  useEffect(() => {
    const fetchEmails = async () => {
      try {
        const res = await fetch("http://localhost:8000/emails");
        const data = await res.json();
        setEmails(data.emails || []);
      } catch (error) {
        console.error("Error fetching emails:", error);
        showToast("Failed to load emails", "error");
      }
    };
    fetchEmails();
  }, []);

  const generateEmailResponse = async (email) => {
    setSelectedEmail(email);
    setLoading(true);
    setThreadLoading(true);
    setEditableResponse("");
    setThreadContext([]);
    setUsedPdfFilename("");

    try {
      const threadRes = await fetch(
        `http://localhost:8000/generate_with_pdf?id=${email.id}`
      );
      const threadData = await threadRes.json();

      setEditableResponse(threadData.response ?? "");
      setThreadContext(threadData?.thread || []);
      setUsedPdfFilename(threadData.pdfFilename || "");
      showToast("Reply generated successfully", "success");
    } catch (error) {
      console.error("Error generating response:", error);
      showToast("Error generating response", "error");
      setEditableResponse("Error generating response.");
    } finally {
      setLoading(false);
      setThreadLoading(false);
    }
  };

  const sendEmail = async () => {
    if (!selectedEmail || !editableResponse.trim()) return;

    const formData = new FormData();
    formData.append("to", selectedEmail.from);
    formData.append("subject", `Re: ${selectedEmail.subject}`);
    formData.append("body", editableResponse);

    try {
      const res = await fetch("http://localhost:8000/send", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.status === "sent") {
        showToast("Reply sent successfully!", "success");
      } else {
        showToast("Failed to send reply", "error");
      }
    } catch (error) {
      showToast("Error sending email", "error");
      console.error("Send error:", error);
    }
  };

  const fetchAttachment = async (messageId, attachmentId) => {
    setAttachmentLoadingId(attachmentId);
    try {
      const res = await fetch(`http://localhost:8000/email/attachment/${messageId}/${attachmentId}`);
      const data = await res.json();
      if (data.pdf) {
        const pdfWindow = window.open();
        pdfWindow.document.write(`
          <html>
            <head><title>PDF Viewer</title><style>body { margin: 0; }</style></head>
            <body>
              <iframe src="data:application/pdf;base64,${data.pdf}" width="100%" height="100%" style="border: none;"></iframe>
            </body>
          </html>
        `);
      }
    } catch (error) {
      console.error("Error fetching attachment:", error);
      showToast("Failed to open PDF attachment", "error");
    } finally {
      setAttachmentLoadingId(null);
    }
  };

  const showToast = (message, type = "info") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const formatEmailAddress = (email) => {
    return email.replace(/<.+>/, '').trim();
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  return (
    <div className="email-responder-container">
      {/* Toast Notification */}
      {toast && (
        <div className={`toast toast-${toast.type}`}>
          {toast.type === 'success' ? <FiCheckCircle /> : <FiXCircle />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Email List Panel */}
      <div className="email-list-panel">
        <div className="panel-header">
          <FiMail className="icon" />
          <h2>Digital Twin - Email Assistant</h2>
          {/* <h2>Unread Emails</h2> */}

        </div>
        
        {emails.length === 0 ? (
          <div className="empty-state">
            <p>No unread emails found</p>
          </div>
        ) : (
          <ul className="email-list">
            {emails.map((email) => (
              <li
                key={email.id}
                className={`email-item ${selectedEmail?.id === email.id ? 'active' : ''}`}
                onClick={() => generateEmailResponse(email)}
              >
                <div className="email-header">
                  <h3 className="email-subject">{email.subject || '(No Subject)'}</h3>
                  <span className="email-date">{formatDate(email.internalDate)}</span>
                </div>
                <p className="email-sender">{formatEmailAddress(email.from)}</p>
                <p className="email-snippet">{email.snippet}</p>
                {email.attachments?.length > 0 && (
                  <div className="email-attachments">
                    <FiPaperclip className="attachment-icon" />
                    <span>{email.attachments.length} attachment(s)</span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Email Detail Panel */}
      <div className="email-detail-panel">
        {selectedEmail ? (
          <>
            <div className="panel-header">
              <h2>Respond to Email</h2>
            </div>

            {/* Thread Context */}
            <div className="thread-context">
              <h3 className="section-title">Thread Context</h3>
              {threadLoading ? (
                <div className="loading-state">
                  <FiLoader className="spin" />
                  <span>Loading thread...</span>
                </div>
              ) : (
                <div className="thread-messages">
                  {threadContext?.map((msg, idx) => (
                    <div key={idx} className="thread-message">
                      <div className="message-content">{msg.snippet}</div>
                      {msg.attachments && msg.attachments.map((att, i) => (
                        <button
                          key={i}
                          onClick={() => fetchAttachment(msg.id, att.id)}
                          disabled={attachmentLoadingId === att.id}
                          className="attachment-button"
                        >
                          {attachmentLoadingId === att.id ? (
                            <><FiLoader className="spin" /> Opening...</>
                          ) : (
                            <><FiPaperclip /> {att.filename}</>
                          )}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Used PDF Indicator */}
            {usedPdfFilename && (
              <div className="pdf-indicator">
                <FiPaperclip />
                <span>Using attachment: {usedPdfFilename}</span>
              </div>
            )}

            {/* Response Editor */}
            <div className="response-editor">
              <h3 className="section-title">AI-Generated Response</h3>
              {loading ? (
                <div className="loading-state">
                  <FiLoader className="spin" />
                  <span>Generating response...</span>
                </div>
              ) : (
                <>
                  <textarea
                    value={editableResponse}
                    onChange={(e) => setEditableResponse(e.target.value)}
                    className="response-textarea"
                    placeholder="The AI-generated response will appear here..."
                  />
                  <button
                    onClick={sendEmail}
                    className="send-button"
                    disabled={!editableResponse.trim()}
                  >
                    <FiSend />
                    <span>Send Reply</span>
                  </button>
                </>
              )}
            </div>
          </>
        ) : (
          <div className="empty-state">
            <FiMail className="large-icon" />
            <p>Select an email to view details and generate a response</p>
          </div>
        )}
      </div>

      {/* CSS Styles */}
      <style jsx>{`
        .email-responder-container {
          display: flex;
          height: 100vh;
          font-family: 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
          color: #333;
          background-color: #f5f7fa;
        }

        .panel-header {
          display: flex;
          align-items: center;
          padding: 16px 24px;
          border-bottom: 1px solid #e1e4e8;
          background-color: #fff;
        }

        .panel-header h2 {
          margin: 0;
          font-size: 18px;
          font-weight: 600;
        }

        .icon {
          margin-right: 12px;
          color: #5e6c84;
        }

        /* Email List Panel */
        .email-list-panel {
          width: 35%;
          min-width: 350px;
          border-right: 1px solid #e1e4e8;
          background-color: #fff;
          overflow-y: auto;
        }

        .email-list {
          list-style: none;
          padding: 0;
          margin: 0;
        }

        .email-item {
          padding: 16px 24px;
          border-bottom: 1px solid #e1e4e8;
          cursor: pointer;
          transition: background-color 0.2s;
        }

        .email-item:hover {
          background-color: #f5f7fa;
        }

        .email-item.active {
          background-color: #e3f2fd;
        }

        .email-header {
          display: flex;
          justify-content: space-between;
          margin-bottom: 8px;
        }

        .email-subject {
          margin: 0;
          font-size: 15px;
          font-weight: 600;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          flex: 1;
        }

        .email-date {
          font-size: 12px;
          color: #5e6c84;
          margin-left: 12px;
        }

        .email-sender {
          margin: 0 0 8px 0;
          font-size: 14px;
          color: #5e6c84;
        }

        .email-snippet {
          margin: 0;
          font-size: 13px;
          color: #5e6c84;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .email-attachments {
          display: flex;
          align-items: center;
          margin-top: 8px;
          font-size: 12px;
          color: #5e6c84;
        }

        .attachment-icon {
          margin-right: 4px;
          font-size: 14px;
        }

        /* Email Detail Panel */
        .email-detail-panel {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow-y: auto;
          background-color: #fff;
        }

        /* Thread Context */
        .thread-context {
          padding: 16px 24px;
          border-bottom: 1px solid #e1e4e8;
        }

        .section-title {
          margin: 0 0 12px 0;
          font-size: 16px;
          font-weight: 600;
          color: #5e6c84;
        }

        .thread-messages {
          max-height: 250px;
          overflow-y: auto;
          padding-right: 8px;
        }

        .thread-message {
          padding: 12px;
          margin-bottom: 12px;
          background-color: #f5f7fa;
          border-radius: 6px;
          font-size: 14px;
        }

        .message-content {
          white-space: pre-wrap;
          margin-bottom: 8px;
        }

        /* PDF Indicator */
        .pdf-indicator {
          display: flex;
          align-items: center;
          padding: 8px 24px;
          font-size: 13px;
          color: #5e6c84;
          background-color: #f5f7fa;
          border-bottom: 1px solid #e1e4e8;
        }

        .pdf-indicator svg {
          margin-right: 8px;
        }

        /* Response Editor */
        .response-editor {
          flex: 1;
          padding: 16px 24px;
          display: flex;
          flex-direction: column;
        }

        .response-textarea {
          flex: 1;
          padding: 16px;
          border: 1px solid #e1e4e8;
          border-radius: 6px;
          font-family: inherit;
          font-size: 14px;
          line-height: 1.5;
          resize: none;
          margin-bottom: 16px;
          transition: border-color 0.2s;
        }

        .response-textarea:focus {
          outline: none;
          border-color: #4d90fe;
          box-shadow: 0 0 0 2px rgba(77, 144, 254, 0.2);
        }

        /* Buttons */
        .attachment-button {
          display: inline-flex;
          align-items: center;
          padding: 4px 8px;
          margin-right: 8px;
          font-size: 12px;
          color: #5e6c84;
          background-color: #fff;
          border: 1px solid #e1e4e8;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .attachment-button:hover {
          background-color: #f5f7fa;
        }

        .attachment-button svg {
          margin-right: 4px;
        }

        .send-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 10px 16px;
          background-color: #2d7ff9;
          color: white;
          border: none;
          border-radius: 4px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: background-color 0.2s;
          align-self: flex-end;
        }

        .send-button:hover {
          background-color: #1a6fdf;
        }

        .send-button:disabled {
          background-color: #c1c7d0;
          cursor: not-allowed;
        }

        .send-button svg {
          margin-right: 8px;
        }

        /* Empty States */
        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: #5e6c84;
          text-align: center;
          padding: 24px;
        }

        .empty-state p {
          margin: 16px 0 0 0;
          font-size: 14px;
        }

        .large-icon {
          font-size: 48px;
          color: #c1c7d0;
        }

        /* Loading States */
        .loading-state {
          display: flex;
          align-items: center;
          color: #5e6c84;
          font-size: 14px;
        }

        .loading-state svg {
          margin-right: 8px;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        /* Toast Notification */
        .toast {
          position: fixed;
          top: 20px;
          right: 20px;
          display: flex;
          align-items: center;
          padding: 12px 16px;
          border-radius: 6px;
          color: white;
          font-size: 14px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          z-index: 1000;
          animation: slideIn 0.3s ease-out;
        }

        .toast-success {
          background-color: #2ecc71;
        }

        .toast-error {
          background-color: #e74c3c;
        }

        .toast svg {
          margin-right: 8px;
        }

        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}