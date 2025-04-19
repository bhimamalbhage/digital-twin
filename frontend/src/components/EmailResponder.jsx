import React, { useState, useEffect } from "react";

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
      // fetch thread + PDF
      const threadRes = await fetch(
        `http://localhost:8000/generate_with_pdf?id=${email.id}`
      );
      const threadData = await threadRes.json();

      // convert base64 → File
      // const pdfBase64 = threadData.pdf;
      const pdfFilename = threadData.pdfFilename || "";
      // const byteCharacters = atob(pdfBase64);
      // const byteNumbers = Array.from(byteCharacters).map((c) =>
      //   c.charCodeAt(0)
      // );
      // const pdfFile = new File(
      //   [new Uint8Array(byteNumbers)],
      //   pdfFilename,
      //   { type: "application/pdf" }
      // );

      setEditableResponse(
        threadData.response ?? threadData.response ?? ""
      );
      setThreadContext(threadData.thread);
      setUsedPdfFilename(pdfFilename);
      showToast("Reply generated successfully", "success");
    } catch (error) {
      console.error("Error generating response:", error);
      showToast("Error generating response.", "error");
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
        showToast("Failed to send reply.", "error");
      }
    } catch (error) {
      showToast("Error sending email.", "error");
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

  return (
    <div style={{ display: "flex", maxWidth: "100%", height: "100vh", padding: "1rem", boxSizing: "border-box", position: "relative" }}>
      {toast && (
        <div style={{
          position: "absolute",
          top: "1rem",
          right: "1rem",
          padding: "0.75rem 1rem",
          borderRadius: "6px",
          backgroundColor: toast.type === "success" ? "#2ecc71" : "#e74c3c",
          color: "white",
          boxShadow: "0 2px 6px rgba(0,0,0,0.2)"
        }}>
          {toast.message}
        </div>
      )}

      <div style={{ width: "50%", borderRight: "1px solid #ddd", paddingRight: "1rem" }}>
        <h2>📩 Unread Emails</h2>
        {emails.length === 0 ? (
          <p>No unread emails found.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0 }}>
            {emails.map((email) => (
              <li
                key={email.id}
                onClick={() => generateEmailResponse(email)}
                style={{
                  padding: "0.5rem",
                  margin: "0.5rem 0",
                  background: selectedEmail?.id === email.id ? "#dfefff" : "#f4f4f4",
                  borderRadius: "6px",
                  cursor: "pointer",
                }}
              >
                <strong>{email.subject}</strong><br />
                <span style={{ fontSize: "0.9em", color: "#555" }}>{email.from}</span>
                <div style={{ fontSize: "0.9em", color: "#777", marginTop: "0.3rem" }}>{email.snippet}</div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div style={{ flex: 1, paddingLeft: "1rem", paddingRight: "1rem", width: "50%" }}>
        {selectedEmail ? (
          <>
            <h3>🧠 Thread Context</h3>
            <div style={{
              backgroundColor: "#fafafa",
              padding: "1rem",
              borderRadius: "6px",
              border: "1px solid #ddd",
              fontSize: "0.9rem",
              maxHeight: "300px",
              overflowY: "auto",
            }}>
              {threadLoading ? (
                <p>Loading thread...</p>
              ) : (
                threadContext.map((msg, idx) => (
                  <div key={idx} style={{ marginBottom: "1rem" }}>
                    <div style={{ whiteSpace: "pre-wrap" }}>{msg.snippet}</div>
                    {msg.attachments && msg.attachments.map((att, i) => (
                      <button
                        key={i}
                        onClick={() => fetchAttachment(msg.id, att.id)}
                        disabled={attachmentLoadingId === att.id}
                        style={{
                          marginTop: "0.5rem",
                          marginRight: "0.5rem",
                          padding: "0.3rem 0.6rem",
                          fontSize: "0.8rem",
                          backgroundColor: "#eee",
                          border: "1px solid #ccc",
                          borderRadius: "4px",
                          cursor: "pointer"
                        }}
                      >
                        {attachmentLoadingId === att.id ? "Opening..." : `📎 ${att.filename}`}
                      </button>
                    ))}
                  </div>
                ))
              )}
            </div>

            {usedPdfFilename && (
              <div style={{ marginTop: "0.5rem", fontSize: "0.9rem" }}>
                <strong>PDF Used:</strong> {usedPdfFilename}
              </div>
            )}

            <h3 style={{ marginTop: "2rem" }}>🤖 AI-Generated Response</h3>
            {loading ? (
              <p>Generating response...</p>
            ) : (
              <>
                <textarea
                  value={editableResponse}
                  onChange={(e) => setEditableResponse(e.target.value)}
                  rows={12}
                  style={{
                    width: "100%",
                    padding: "1rem",
                    fontFamily: "monospace",
                    backgroundColor: "#f0f0f0",
                    borderRadius: "6px",
                    border: "1px solid #ccc",
                    whiteSpace: "pre-wrap",
                  }}
                />
                <button
                  onClick={sendEmail}
                  style={{
                    marginTop: "1rem",
                    padding: "0.5rem 1rem",
                    fontSize: "1rem",
                    backgroundColor: "#3498db",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer",
                  }}
                >
                  📤 Send Reply
                </button>
              </>
            )}
          </>
        ) : (
          <p>Select an email to view details.</p>
        )}
      </div>
    </div>
  );
}
