"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { SafeFixture } from "../contracts/vendor/v1/safeMvp";
import type { RequestDraftInput } from "../contracts/vendor/v1/requestDraft";
import { ApiFailure, createSafeApi } from "../lib/safeApi";

const configuredOrigin = process.env.NEXT_PUBLIC_API_BASE_URL ?? (process.env.NODE_ENV === "development" ? "http://localhost:5000" : "/");
type User = { name: string; email: string };
type Phase = "loading" | "signed-out" | "ready" | "error";

function publicMessage(error: unknown): string {
  return error instanceof ApiFailure ? error.message : "The request could not be completed.";
}

export function SafeMvp() {
  const api = useMemo(() => { try { return createSafeApi(configuredOrigin); } catch { return null; } }, []);
  const [phase, setPhase] = useState<Phase>("loading");
  const [user, setUser] = useState<User | null>(null);
  const [fixtures, setFixtures] = useState<SafeFixture[]>([]);
  const [selected, setSelected] = useState("");
  const [draft, setDraft] = useState<RequestDraftInput | null>(null);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const mounted = useRef(false);

  const clearPrivateState = useCallback(() => {
    setUser(null); setFixtures([]); setSelected(""); setDraft(null);
    setName(""); setEmail(""); setPassword(""); setMode("signin");
  }, []);
  const handleFailure = useCallback((error: unknown) => {
    if (!mounted.current) return;
    if (error instanceof ApiFailure && error.code === "UNAUTHENTICATED") {
      clearPrivateState(); setPhase("signed-out");
    }
    setMessage(publicMessage(error));
  }, [clearPrivateState]);

  useEffect(() => {
    let active = true;
    mounted.current = true;
    async function load() {
      if (!api) { if (active) { setMessage("Configure NEXT_PUBLIC_API_BASE_URL with a secure backend origin."); setPhase("error"); } return; }
      try {
        const session = await api.session();
        if (!active) return;
        if (!session) { clearPrivateState(); setPhase("signed-out"); return; }
        const [catalog, saved] = await Promise.all([api.catalog(), api.draft()]);
        if (!active) return;
        if (saved && !catalog.some(item => item.repositoryId === saved.repositoryId && item.fixtureKey === saved.fixtureKey && item.issueNumber === saved.issueNumber)) throw new ApiFailure("INVALID_RESPONSE", "The saved draft is unavailable. Try again.");
        setUser(session); setFixtures(catalog); setDraft(saved); setSelected(saved?.repositoryId ?? catalog[0]?.repositoryId ?? ""); setPhase("ready");
      } catch (error) {
        if (active) {
          handleFailure(error);
          if (!(error instanceof ApiFailure && error.code === "UNAUTHENTICATED")) setPhase("error");
        }
      }
    }
    void load();
    return () => { active = false; mounted.current = false; api?.cancelPending(); };
  }, [api, clearPrivateState, handleFailure]);

  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!api || busy) return;
    setBusy(true); setMessage("");
    try {
      if (mode === "signin") await api.signIn(email, password);
      else await api.signUp(name, email, password);
      if (!mounted.current) return;
      const session = await api.session();
      if (!mounted.current) return;
      if (!session) throw new ApiFailure("AUTH_FAILED", "Sign-in did not create a session.");
      const [catalog, saved] = await Promise.all([api.catalog(), api.draft()]);
      if (!mounted.current) return;
      if (saved && !catalog.some(item => item.repositoryId === saved.repositoryId && item.fixtureKey === saved.fixtureKey && item.issueNumber === saved.issueNumber)) throw new ApiFailure("INVALID_RESPONSE", "The saved draft is unavailable. Try again.");
      setUser(session); setFixtures(catalog); setDraft(saved); setSelected(saved?.repositoryId ?? catalog[0]?.repositoryId ?? ""); setPhase("ready");
    } catch (error) { handleFailure(error); }
    finally { if (mounted.current) { setPassword(""); setBusy(false); } }
  }

  async function signOut() {
    if (!api || busy) return;
    setBusy(true); setMessage("");
    try { await api.signOut(); if (mounted.current) { clearPrivateState(); setPhase("signed-out"); } }
    catch (error) { handleFailure(error); }
    finally { if (mounted.current) setBusy(false); }
  }

  async function saveDraft() {
    const fixture = fixtures.find(item => item.repositoryId === selected);
    if (!api || !fixture || busy) return;
    setBusy(true); setMessage("");
    try { const saved = await api.saveDraft(fixture); if (mounted.current) { setDraft(saved); setMessage("Draft saved. No run was created."); } }
    catch (error) { handleFailure(error); }
    finally { if (mounted.current) setBusy(false); }
  }

  async function deleteDraft() {
    if (!api || busy) return;
    setBusy(true); setMessage("");
    try { await api.deleteDraft(); if (mounted.current) { setDraft(null); setMessage("Draft deleted."); } }
    catch (error) { handleFailure(error); }
    finally { if (mounted.current) setBusy(false); }
  }

  async function requestRun() {
    const fixture = fixtures.find(item => item.repositoryId === selected);
    if (!api || !fixture || busy) return;
    setBusy(true); setMessage("");
    try { await api.requestRun(fixture); }
    catch (error) { handleFailure(error); }
    finally { if (mounted.current) setBusy(false); }
  }

  return (
    <div className="shell">
      <header className="topbar"><a className="brand" href="/" aria-label="RepoProof home"><span className="brand-mark">R</span> RepoProof</a><span className="top-note">Curated fixture preview</span></header>
      <main className="main">
        <div className="eyebrow"><span className="dot" /> Evidence-first development</div>
        <h1>Fixes deserve <em>proof.</em></h1>
        <p className="intro">Explore an approved issue and see what RepoProof can verify. Execution stays unavailable until an isolated runner is ready.</p>
        <section className="card" aria-labelledby="workspace-title">
          <div className="card-head"><div><p className="kicker">YOUR WORKSPACE</p><h2 id="workspace-title">{phase === "ready" ? "Choose a fixture" : "Start with your account"}</h2></div><span className="status"><span className="status-dot" /> Runner unavailable</span></div>
          {phase === "loading" && <p role="status">Checking your session…</p>}
          {phase === "error" && <div className="notice" role="alert"><p>{message}</p><button type="button" onClick={() => window.location.reload()}>Try again</button></div>}
          {phase === "signed-out" && <form onSubmit={authenticate}>
            <p className="muted">Sign in to view the curated fixture catalog.</p>
            {mode === "signup" && <label>Display name<input autoComplete="name" value={name} onChange={event => setName(event.target.value)} maxLength={200} required /></label>}
            <label>Email<input type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} maxLength={320} required /></label>
            <label>Password<input type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} value={password} onChange={event => setPassword(event.target.value)} minLength={8} required /></label>
            {message && <p className="notice" role="alert">{message}</p>}
            <div className="actions"><button className="primary" type="submit" disabled={busy}>{busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}</button><button className="text-button" type="button" disabled={busy} onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setPassword(""); setMessage(""); }}>{mode === "signin" ? "Create an account" : "Already have an account?"}</button></div>
          </form>}
          {phase === "ready" && <div>
            <div className="identity"><span>Signed in as <strong>{user?.email}</strong></span><button className="text-button" type="button" disabled={busy} onClick={signOut}>Sign out</button></div>
            {fixtures.length > 0 ? <><label>Approved repository<select value={selected} onChange={event => { setSelected(event.target.value); setMessage(""); }}>{fixtures.map(item => <option key={item.repositoryId} value={item.repositoryId}>{item.repository} · issue #{item.issueNumber}</option>)}</select></label><p className="muted">Curated snapshot. No live GitHub data or code execution.</p>{draft && <p className="muted">Saved draft: {fixtures.find(item => item.repositoryId === draft.repositoryId)?.repository} · issue #{draft.issueNumber}. This is not a run.</p>}<div className="actions"><button type="button" disabled={busy || !selected} onClick={saveDraft}>Save draft</button>{draft && <button type="button" disabled={busy} onClick={deleteDraft}>Delete draft</button>}<button className="primary" type="button" disabled={busy || !selected} onClick={requestRun}>{busy ? "Working…" : "Request verification"}</button></div></> : <p className="muted">No approved fixtures are available.</p>}
            {message && <p className="notice" role="status" aria-live="polite">{message}</p>}
          </div>}
        </section>
        <section className="principles" aria-label="Verification principles"><div><span>01</span><h3>Scoped inputs</h3><p>Only approved fixture metadata is shown.</p></div><div><span>02</span><h3>Honest status</h3><p>Unavailable execution never becomes a verdict.</p></div><div><span>03</span><h3>Evidence first</h3><p>Verification requires independent results.</p></div></section>
      </main><footer>RepoProof <span>·</span> A safer way to inspect proposed fixes</footer>
    </div>
  );
}
