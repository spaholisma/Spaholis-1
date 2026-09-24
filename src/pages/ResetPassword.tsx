import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";
import { homeFor, initialPasswordLink } from "@/lib/authRedirect";
import { toast } from "sonner";

// Where a "choose your password" link lands — for a new account the team made,
// and for "Forgot password".
//
// It used to wait for one event and nothing else, so a link that had already
// been used (they work once) or had expired left the page on "Loading…" for
// good. Now it looks at what the link brought: a session → the form; an error,
// or nothing after a while → say so, and offer a fresh link.
type State = "checking" | "ready" | "invalid";

// How long to wait for the session a link brings before calling it expired.
const WAIT_MS = 12000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ResetPassword = () => {
  const [state, setState] = useState<State>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const link = initialPasswordLink();
    let settled = false;
    const ready = () => { if (!settled) { settled = true; setState("ready"); } };
    const invalid = () => { if (!settled) { settled = true; setState("invalid"); } };

    if (link.kind === "error") {
      invalid();
      return;
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN" || event === "INITIAL_SESSION")) ready();
    });

    (async () => {
      if (link.kind === "code") {
        const { error } = await supabase.auth.exchangeCodeForSession(link.code);
        if (error) { invalid(); return; }
      }
      // Resolves once the client has read the link, so a session here is theirs.
      const { data: { session } } = await supabase.auth.getSession();
      if (session) ready();
      else invalid();
    })();

    const timer = window.setTimeout(invalid, WAIT_MS);
    return () => { subscription.unsubscribe(); window.clearTimeout(timer); };
  }, []);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) { toast.error("Use at least 6 characters"); return; }
    if (password !== confirm) { toast.error("The two passwords are not the same"); return; }
    setLoading(true);
    const { data, error } = await supabase.auth.updateUser({ password });
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    toast.success("Password saved — you are signed in.");
    navigate(await homeFor(data.user?.id));
    setLoading(false);
  };

  const sendNewLink = async (e: React.FormEvent) => {
    e.preventDefault();
    const address = email.trim();
    if (!EMAIL_RE.test(address)) { toast.error("Enter the email you use with Holis"); return; }
    setSending(true);
    const { error } = await supabase.auth.resetPasswordForEmail(address, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setSending(false);
    if (error) { toast.error(error.message); return; }
    setSent(true);
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-24 pb-16 px-4 max-w-md mx-auto">
        {state === "checking" && (
          <>
            <h1 className="spa-heading-lg text-foreground text-center mb-6">Choose your password</h1>
            <p className="spa-body text-center">Opening your link…</p>
          </>
        )}

        {state === "ready" && (
          <>
            <h1 className="spa-heading-lg text-foreground text-center mb-6">Choose your password</h1>
            <form onSubmit={handleReset} className="bg-card rounded-2xl border border-border p-8 space-y-5">
              <div>
                <label htmlFor="new-password" className="font-body text-sm font-medium text-foreground mb-1.5 block">New password</label>
                <Input id="new-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} />
              </div>
              <div>
                <label htmlFor="confirm-password" className="font-body text-sm font-medium text-foreground mb-1.5 block">Repeat the password</label>
                <Input id="confirm-password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="••••••••" required minLength={6} />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Saving…" : "Save password"}
              </Button>
            </form>
          </>
        )}

        {state === "invalid" && (
          <>
            <h1 className="spa-heading-lg text-foreground text-center mb-4">This link has expired</h1>
            <p className="spa-body text-center mb-6">
              Password links work once and only for a while — this one was already used or is too old.
              Enter your email and we will send you a new one.
            </p>
            {sent ? (
              <div className="bg-card rounded-2xl border border-border p-8 text-center space-y-2">
                <p className="font-body text-foreground font-medium">Check your inbox</p>
                <p className="font-body text-sm text-muted-foreground">
                  If {email.trim()} has an account, a new link is on its way. Open the newest email.
                </p>
              </div>
            ) : (
              <form onSubmit={sendNewLink} className="bg-card rounded-2xl border border-border p-8 space-y-5">
                <div>
                  <label htmlFor="reset-email" className="font-body text-sm font-medium text-foreground mb-1.5 block">Email</label>
                  <Input id="reset-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
                </div>
                <Button type="submit" className="w-full" disabled={sending}>
                  {sending ? "Sending…" : "Send me a new link"}
                </Button>
              </form>
            )}
            <p className="text-center mt-6 font-body text-sm">
              <Link to="/auth" className="underline text-muted-foreground hover:text-foreground">Back to sign in</Link>
            </p>
          </>
        )}
      </div>
      <Footer />
    </div>
  );
};

export default ResetPassword;
