import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../context/AuthContext";
import { useScenario } from "../context/ScenarioContext";
import {
  listScenarios,
  saveScenario,
  deleteScenario,
  type SavedScenario,
} from "../services/scenarioStore";

// Optional account layer for the twin. Floats top-right (the Chatbot owns bottom-right).
// Renders nothing when Supabase isn't configured, so the standalone simulator is untouched.
export default function AccountMenu() {
  const auth = useAuth();
  const { inputs, setInputs } = useScenario();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [status, setStatus] = useState("");
  const [saved, setSaved] = useState<SavedScenario[]>([]);

  useEffect(() => {
    if (!open || !auth.user) return;
    listScenarios()
      .then(setSaved)
      .catch((e: unknown) =>
        setStatus(e instanceof Error ? e.message : "Could not load scenarios"),
      );
  }, [open, auth.user]);

  if (!auth.configured) return null;

  async function handleAuth(e: FormEvent) {
    e.preventDefault();
    setStatus(mode === "signin" ? "Signing in…" : "Creating account…");
    try {
      if (mode === "signin") {
        await auth.signIn(email, password);
        setStatus("");
      } else {
        await auth.signUp(email, password);
        setStatus("Check your email to confirm, then sign in.");
      }
    } catch (err: unknown) {
      setStatus(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  async function handleSave() {
    if (!auth.user || !name.trim()) return;
    setStatus("Saving…");
    try {
      await saveScenario(name.trim(), inputs, auth.user.id);
      setName("");
      setSaved(await listScenarios());
      setStatus("Saved.");
    } catch (err: unknown) {
      setStatus(err instanceof Error ? err.message : "Save failed");
    }
  }

  function handleLoad(s: SavedScenario) {
    setInputs(s.scenario);
    setStatus(`Loaded "${s.name}".`);
  }

  async function handleDelete(id: string) {
    try {
      await deleteScenario(id);
      setSaved((prev) => prev.filter((s) => s.id !== id));
    } catch (err: unknown) {
      setStatus(err instanceof Error ? err.message : "Delete failed");
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed top-4 right-4 z-50 rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-lg hover:bg-gray-50"
      >
        {auth.user ? "Account" : "Sign in"}
      </button>
    );
  }

  return (
    <div className="fixed top-4 right-4 z-50 flex w-80 flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-2xl">
      <div className="flex items-center justify-between">
        <span className="truncate text-sm font-semibold text-gray-800">
          {auth.user ? auth.user.email : "Sign in to save scenarios"}
        </span>
        <button
          onClick={() => setOpen(false)}
          className="ml-2 text-gray-400 hover:text-gray-700"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      {!auth.user ? (
        <form onSubmit={handleAuth} className="flex flex-col gap-2">
          <input
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            type="password"
            required
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-md bg-leaf-500 px-3 py-2 text-sm font-semibold text-white hover:bg-leaf-600"
          >
            {mode === "signin" ? "Sign in" : "Create account"}
          </button>
          <button
            type="button"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            {mode === "signin"
              ? "Need an account? Sign up"
              : "Have an account? Sign in"}
          </button>
        </form>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            <input
              placeholder="Name this scenario"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="min-w-0 flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <button
              onClick={handleSave}
              className="shrink-0 rounded-md bg-leaf-500 px-3 py-2 text-sm font-semibold text-white hover:bg-leaf-600"
            >
              Save
            </button>
          </div>
          <div className="max-h-60 overflow-y-auto">
            {saved.length === 0 ? (
              <p className="text-xs text-gray-400">No saved scenarios yet.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {saved.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between rounded-md border border-gray-200 px-2 py-1.5 text-sm"
                  >
                    <button
                      onClick={() => handleLoad(s)}
                      className="min-w-0 flex-1 truncate text-left text-gray-700 hover:text-leaf-600"
                      title="Load this scenario"
                    >
                      {s.name}
                    </button>
                    <button
                      onClick={() => handleDelete(s.id)}
                      className="ml-2 shrink-0 text-gray-300 hover:text-red-500"
                      aria-label={`Delete ${s.name}`}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button
            onClick={() => auth.signOut()}
            className="self-start text-xs text-gray-500 hover:text-gray-700"
          >
            Sign out
          </button>
        </div>
      )}

      {status && <p className="text-xs text-gray-500">{status}</p>}
    </div>
  );
}
