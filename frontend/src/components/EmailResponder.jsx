import React, { useState } from "react";

export default function EmailResponder() {
  const [emailText, setEmailText] = useState("");
  const [pdfFile, setPdfFile] = useState(null);
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);

  const handlePdfUpload = (e) => {
    setPdfFile(e.target.files[0]);
  };

  const generateEmailResponse = async () => {
    if (!emailText || !pdfFile) return;

    const formData = new FormData();
    formData.append("email_text", emailText);
    formData.append("pdf", pdfFile);

    setLoading(true);
    setResponse("");

    try {
      const res = await fetch("http://localhost:8000/generate", {
        method: "POST",
        body: formData,
      });

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
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '1rem' }}>
      <h2>Incoming Email</h2>
      <textarea
        placeholder="Paste your email text here..."
        rows={8}
        style={{ width: '100%', padding: '0.5rem', marginBottom: '1rem' }}
        value={emailText}
        onChange={(e) => setEmailText(e.target.value)}
      />

      <input
        type="file"
        accept="application/pdf"
        onChange={handlePdfUpload}
        style={{ display: 'block', marginBottom: '1rem' }}
      />

      <button
        onClick={generateEmailResponse}
        disabled={!emailText || !pdfFile || loading}
        style={{ padding: '0.5rem 1rem' }}
      >
        {loading ? "Generating Response..." : "Generate Response"}
      </button>

      {response && (
        <div style={{ marginTop: '2rem' }}>
          <h2>Response</h2>
          <pre style={{ backgroundColor: '#f4f4f4', padding: '1rem', whiteSpace: 'pre-wrap' }}>{response}</pre>
        </div>
      )}
    </div>
  );
}