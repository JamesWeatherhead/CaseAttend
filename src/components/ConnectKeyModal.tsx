import React, { useState, useEffect } from 'react';
import { X, KeyRound, ShieldCheck, ExternalLink, Check, Gift } from 'lucide-react';
import { beginOpenRouterOAuth } from '../services/openrouterAuth';
import { hasKey, getModel, setModel, clearKey, MODEL_OPTIONS } from '../services/byokStore';

interface ConnectKeyModalProps {
  onClose: () => void;
}

const isFree = (id: string) => id.endsWith(':free');

/**
 * "Bring your own AI" modal.
 *  - Continue with OpenRouter (OAuth SSO — full-page PKCE redirect).
 *  - Pick a PINNED model (free options first) — updates byokStore, which the
 *    status bar reflects live. No free-text entry, so no runaway-cost model.
 * The key is minted into the browser and never touches our servers.
 */
const ConnectKeyModal: React.FC<ConnectKeyModalProps> = ({ onClose }) => {
  const [connected, setConnected] = useState<boolean>(hasKey());
  const [selectedModel, setSelectedModel] = useState<string>(getModel());
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    setConnected(hasKey());
  }, []);

  const chooseModel = (id: string) => {
    setSelectedModel(id);
    setModel(id); // dispatches BYOK_CHANGED_EVENT → status bar / model label update live
  };

  const handleConnect = async () => {
    setConnecting(true);
    setModel(selectedModel); // persist choice before we navigate away to OpenRouter
    try {
      await beginOpenRouterOAuth(); // full-page redirect to openrouter.ai/auth
    } catch {
      setConnecting(false);
    }
  };

  const handleDisconnect = () => {
    clearKey();
    setConnected(false);
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-[#0f1011] border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-500/15 flex items-center justify-center">
              <KeyRound className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[#f7f8f8]">Bring your own AI</h2>
              <p className="text-[11px] text-[#8a8f98]">Use your own OpenRouter balance — never a shared developer key</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[#8a8f98] hover:text-white p-1 rounded-lg hover:bg-[#1e1f21] transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Connection status / CTA */}
          {connected ? (
            <div className="flex items-center gap-2 text-xs text-emerald-300 bg-emerald-950/40 border border-emerald-500/20 rounded-lg px-3 py-2.5">
              <Check className="w-4 h-4 flex-shrink-0" />
              <span>Your key is stored in this browser and sent only to OpenRouter.</span>
            </div>
          ) : (
            <div className="space-y-1.5">
              <button
                onClick={handleConnect}
                disabled={connecting}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors"
              >
                {connecting ? 'Redirecting to OpenRouter…' : 'Continue with OpenRouter'}
                {!connecting && <ExternalLink className="w-3.5 h-3.5" />}
              </button>
              <p className="text-[11px] text-[#8a8f98] leading-relaxed px-0.5">
                Securely connect your account to use your preferred AI models. CaseAttend never
                charges model usage to a shared developer key — costs bill through your own
                OpenRouter account, and the Free models below cost nothing.
              </p>
            </div>
          )}

          {/* Model picker (pinned for cost safety) */}
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#8a8f98] mb-2">Model</div>
            <div className="flex flex-col gap-1.5">
              {MODEL_OPTIONS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => chooseModel(m.id)}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg border text-left transition-colors ${
                    selectedModel === m.id
                      ? 'bg-blue-950/40 border-blue-500/40'
                      : 'bg-[#161718] border-white/[0.06] hover:border-white/[0.15]'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium text-[#f7f8f8]">{m.label}</span>
                      {isFree(m.id) && (
                        <span className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 rounded px-1 py-px">
                          <Gift className="w-2.5 h-2.5" /> Free
                        </span>
                      )}
                    </div>
                    {m.note && <div className="text-[10px] text-[#8a8f98] truncate">{m.note}</div>}
                  </div>
                  {selectedModel === m.id && <Check className="w-4 h-4 text-blue-400 flex-shrink-0" />}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[10px] text-[#8a8f98]">
              Free models need no credit (subject to OpenRouter's daily free-tier limit). Paid
              models cost roughly a few cents per case, billed to your OpenRouter account.
            </p>
          </div>

          {/* Security note */}
          <div className="flex items-start gap-2 text-[11px] text-[#8a8f98] bg-[#161718] border border-white/[0.06] rounded-lg px-3 py-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
            <span>
              Your key is stored in this browser and sent only to OpenRouter. CaseAttend servers do
              not receive your key, case images, or chat. When you submit a question, the current
              view and message go directly to OpenRouter and the selected model provider. Do not use
              identifiable patient data. You can set a spend cap when you authorize.
            </span>
          </div>

          {/* Manage links */}
          <div className="flex items-center gap-3 text-[10px]">
            <a
              href="https://openrouter.ai/keys"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 inline-flex items-center gap-1"
            >
              <ExternalLink className="w-2.5 h-2.5" /> Manage keys
            </a>
            <a
              href="https://openrouter.ai/activity"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 inline-flex items-center gap-1"
            >
              <ExternalLink className="w-2.5 h-2.5" /> Usage &amp; spend
            </a>
            <a
              href="https://openrouter.ai/credits"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 inline-flex items-center gap-1"
            >
              <ExternalLink className="w-2.5 h-2.5" /> Add credit
            </a>
          </div>

          {connected && (
            <button
              onClick={handleDisconnect}
              className="w-full text-xs font-medium text-red-300/80 hover:text-red-300 py-1.5"
            >
              Disconnect OpenRouter
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ConnectKeyModal;
