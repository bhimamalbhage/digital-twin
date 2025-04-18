import React, { useState, useEffect } from "react";

export default function EmailResponder() {
  const [emails, setEmails] = useState([]);
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);

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

  const generateEmailResponse = async (emailId) => {
    setLoading(true);
    setResponse("");
    try {
      const res = await fetch(`http://localhost:8000/generate_with_pdf?id=${emailId}`);
      const data = await res.json();
      setResponse(data.response);
    } catch (error) {
      setResponse("Error generating response.");
      console.error("API call failed:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: "800px", margin: "0 auto", padding: "1rem" }}>
      <h2>📥 Unread Emails</h2>

      {emails.length === 0 ? (
        <p>No unread emails found.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {emails.map((email) => (
            <li
              key={email.id}
              onClick={() => {
                setSelectedEmail(email);
                generateEmailResponse(email.id);
              }}
              style={{
                padding: "0.5rem",
                margin: "0.5rem 0",
                background: selectedEmail?.id === email.id ? "#dfefff" : "#f4f4f4",
                borderRadius: "6px",
                cursor: "pointer",
              }}
            >
              <strong>{email.subject}</strong> <br />
              <span style={{ fontSize: "0.9em", color: "#555" }}>{email.from}</span>
              <div style={{ fontSize: "0.9em", color: "#777", marginTop: "0.3rem" }}>{email.snippet}</div>
            </li>
          ))}
        </ul>
      )}

      {selectedEmail && (
        <div style={{ marginTop: "2rem" }}>
          <h3>AI-Generated Response</h3>
          {loading ? (
            <p>Generating...</p>
          ) : (
            <pre
              style={{
                backgroundColor: "#f0f0f0",
                padding: "1rem",
                whiteSpace: "pre-wrap",
                borderRadius: "6px",
              }}
            >
              {response}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
