import { useState } from "react";
import { api } from "../lib/api";
import { Card, StatusBadge } from "../components/ui";

const EXAMPLES = [
  "Mera payment fail ho gaya tha, dobara payment karna hai",
  "Maine already paid kar diya tha kal",
  "Please dobara mat call karo",
  "Thik hai, mujhe payment link bhej do",
  "Abhi nahi, baad me karunga",
  "Mujhe support se baat karni hai",
];

export default function VoiceRecovery() {
  const [caseId, setCaseId] = useState("");
  const [transcript, setTranscript] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.voiceRecovery({
        transcript,
        case_id: caseId || undefined,
      });
      setResult(r);
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  };

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Voice Recovery</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Hinglish / English intent recovery — same policy engine, different
          channel.
        </p>
      </div>

      <Card className="border-risk/30 p-4 text-sm text-text-secondary">
        <span className="font-medium text-risk">Honest scope:</span> there is no
        live microphone or speech-to-text in this build. Type a transcript below
        exactly as a speech-to-text engine would have produced it — the intent
        classification and policy-gated recovery workflow below it are real, not
        mocked.
      </Card>

      <Card className="p-5">
        <label className="text-xs uppercase tracking-wide text-text-tertiary">
          Case ID (optional — required to execute a recovery action)
        </label>
        <input
          value={caseId}
          onChange={(e) => setCaseId(e.target.value)}
          placeholder="e.g. from the Revenue Risk Inbox URL"
          className="mt-1 w-full rounded-md border border-line bg-ink-850 px-3 py-2 font-mono text-sm"
        />

        <label className="mt-4 block text-xs uppercase tracking-wide text-text-tertiary">
          Transcript
        </label>
        <textarea
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          rows={3}
          placeholder="Mera payment fail ho gaya tha, dobara payment karna hai"
          className="mt-1 w-full rounded-md border border-line bg-ink-850 px-3 py-2 text-sm"
        />

        <div className="mt-3 flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => setTranscript(ex)}
              className="rounded-full border border-line px-3 py-1 text-xs text-text-secondary hover:bg-ink-800"
            >
              {ex}
            </button>
          ))}
        </div>

        <button
          onClick={send}
          disabled={busy || !transcript}
          className="mt-4 rounded-md bg-ai px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Classifying…" : "Send transcript"}
        </button>
      </Card>

      {error && <Card className="p-4 text-sm text-block">{error}</Card>}

      {result && (
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="font-display text-lg font-medium text-ai">
              {result.intent}
            </div>
            <span className="rounded-full bg-risk-soft px-2.5 py-1 text-xs text-risk">
              {result.mode}
            </span>
          </div>
          <div className="text-sm text-text-secondary">
            Confidence:{" "}
            <span className="font-mono">{result.intent_confidence}</span>
            {result.matched_phrase && (
              <>
                {" "}
                · matched phrase:{" "}
                <span className="font-mono">"{result.matched_phrase}"</span>
              </>
            )}
          </div>
          <div className="mt-3 rounded-md border border-line-soft bg-ink-850 p-3 text-sm">
            {result.policy}
          </div>
          {result.action_taken && (
            <div className="mt-3">
              <StatusBadge status={result.action_taken} />
            </div>
          )}
          {result.orchestrator_result && (
            <div className="mt-3 border-t border-line-soft pt-3 text-sm">
              <div className="text-xs uppercase tracking-wide text-text-tertiary">
                Routed through the standard recovery workflow
              </div>
              <pre className="mt-2 overflow-x-auto rounded-md bg-ink-950 p-3 text-xs text-text-secondary">
                {JSON.stringify(result.orchestrator_result.decision, null, 2)}
              </pre>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
