"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  ArrowUpRight,
  Check,
  CircleAlert,
  ClipboardCheck,
  CloudOff,
  FileCheck2,
  LogOut,
  Plus,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";
import { usePrivy } from "@privy-io/react-auth";
import { useWallet } from "@/components/wallet-provider";
import { formatGen, formatUptime } from "@/lib/constants";
import { readAgreements, readClaims, readSnapshots, writeContract } from "@/lib/genlayer";
import type { Agreement, Claim, Snapshot } from "@/lib/types";

type ServiceStatus = {
  outage: boolean;
  uptime_bps: number;
  total_checks: number;
  failed_checks: number;
  last_checked_at: string | null;
};

const initialForm = {
  service_name: "Pactline Demo API",
  service_url: "",
  terms: "If uptime falls below the threshold, return the agreed share of the deposit.",
  threshold: "99.90",
  window_days: "1",
  compensation_type: "refund",
  compensation: "20",
  deposit: "0.01",
};

function shortAddress(value: string | null) {
  return value ? `${value.slice(0, 6)}...${value.slice(-4)}` : "";
}

function dateLabel(value: string | number) {
  return new Date(typeof value === "number" ? value * 1000 : value).toLocaleDateString(
    undefined,
    { month: "short", day: "numeric" },
  );
}

function HowItWorks({ onStart }: { onStart: () => void }) {
  return (
    <section className="how-page" aria-labelledby="how-title">
      <div className="how-intro">
        <div>
          <p className="eyebrow">A clearer way to ask for what you are owed</p>
          <h1 id="how-title">A service promise should come with a receipt.</h1>
          <p className="hero-copy">Pactline turns an SLA into a small, self contained process. You set the rule, the monitor keeps the record, and GenLayer helps make the call when the numbers get uncomfortable.</p>
        </div>
        <div className="how-summary">
          <span className="aside-kicker">The whole idea</span>
          <strong>Promise. Proof. Payout.</strong>
          <p>No chasing support, no arguing over a screenshot, and no claim so small that it is not worth making.</p>
        </div>
      </div>

      <div className="how-steps">
        <article className="how-step">
          <div className="step-topline"><span className="step-number">01</span><ShieldCheck size={19} /></div>
          <h2>Register the promise</h2>
          <p>Tell Pactline which service you pay for, where its health check lives, and what should happen when uptime falls short.</p>
          <div className="step-detail"><Check size={14} /> Threshold, time window, and settlement share</div>
        </article>
        <article className="how-step">
          <div className="step-topline"><span className="step-number">02</span><Activity size={19} /></div>
          <h2>Let the monitor keep score</h2>
          <p>The monitor checks the public health endpoint and publishes a signed snapshot. The evidence stays close to the agreement instead of disappearing into an inbox.</p>
          <div className="step-detail"><FileCheck2 size={14} /> Signed uptime evidence with a source link</div>
        </article>
        <article className="how-step">
          <div className="step-topline"><span className="step-number">03</span><CircleAlert size={19} /></div>
          <h2>File the claim</h2>
          <p>When the snapshot shows a breach, file a claim. GenLayer validators compare the evidence with the rule and record the decision in the contract.</p>
          <div className="step-detail"><ArrowUpRight size={14} /> A decision that can be checked later</div>
        </article>
        <article className="how-step">
          <div className="step-topline"><span className="step-number">04</span><ClipboardCheck size={19} /></div>
          <h2>Collect the result</h2>
          <p>A successful breach claim settles the agreed refund or records the service credit. The money does not need another meeting to find its way home.</p>
          <div className="step-detail"><Check size={14} /> Automatic settlement from the deposit</div>
        </article>
      </div>

      <section className="how-benefits">
        <div>
          <p className="section-kicker">Why use Pactline</p>
          <h2>It makes the small claims worth making.</h2>
        </div>
        <div className="benefit-list">
          <div className="benefit-item"><ShieldCheck size={18} /><div><strong>Evidence with context</strong><p>The source URL, signed snapshot, and validator decision travel together.</p></div></div>
          <div className="benefit-item"><CloudOff size={18} /><div><strong>Less awkward chasing</strong><p>The service can miss its promise without you writing the fifth polite follow up.</p></div></div>
          <div className="benefit-item"><ClipboardCheck size={18} /><div><strong>A rule you chose</strong><p>You decide the threshold and compensation before the outage has a chance to become an argument.</p></div></div>
        </div>
      </section>

      <section className="how-start">
        <div>
          <p className="section-kicker">Ready when you are</p>
          <h2>Put one service on the line.</h2>
          <p>It takes one agreement and a deposit to start keeping a proper receipt.</p>
        </div>
        <button className="primary-button light" onClick={onStart}><Plus size={16} /> Add a service</button>
      </section>
    </section>
  );
}

export default function Home() {
  const { ready, authenticated } = usePrivy();
  const { address, provider, connect, disconnect, wrongNetwork } = useWallet();
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [service, setService] = useState<ServiceStatus | null>(null);
  const [showRegister, setShowRegister] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [busy, setBusy] = useState("");
  const [toast, setToast] = useState("");
  const [view, setView] = useState<"desk" | "how">("desk");

  const refresh = useCallback(async () => {
    const [nextAgreements, nextSnapshots, nextClaims, serviceResponse] = await Promise.all([
      readAgreements(),
      readSnapshots(),
      readClaims(),
      fetch("/api/service/status").then((response) => response.ok ? response.json() : null),
    ]);
    setAgreements(nextAgreements);
    setSnapshots(nextSnapshots);
    setClaims(nextClaims);
    setService(serviceResponse as ServiceStatus | null);
  }, []);

  useEffect(() => {
    // Load the external service and contract state when the workbench opens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const customerAgreements = useMemo(
    () => (address ? agreements.filter((item) => item.customer.toLowerCase() === address.toLowerCase()) : []),
    [address, agreements],
  );
  const recentClaims = useMemo(
    () => (address ? claims.filter((item) => item.customer.toLowerCase() === address.toLowerCase()) : claims),
    [address, claims],
  );
  const lastSnapshot = snapshots.at(-1);
  const stats = [
    { label: "Agreements", value: customerAgreements.length },
    { label: "Evidence packets", value: snapshots.length },
    { label: "Claims resolved", value: recentClaims.length },
    { label: "Demo uptime", value: service ? formatUptime(service.uptime_bps) : "100.00%" },
  ];

  async function controlService(outage: boolean) {
    setBusy("service");
    try {
      const response = await fetch("/api/service/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outage }),
      });
      if (!response.ok) throw new Error("The service control did not respond.");
      setToast(outage ? "The demo service is now having a difficult day." : "The demo service is back on its feet.");
      await refresh();
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Could not update the demo service.");
    } finally {
      setBusy("");
    }
  }

  async function submitRegistration(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!address || !provider) {
      connect();
      return;
    }
    setBusy("register");
    try {
      const thresholdBps = Math.round(Number(form.threshold) * 100);
      const compensationBps = Math.round(Number(form.compensation) * 100);
      const depositWei = BigInt(Math.round(Number(form.deposit) * 1_000_000_000_000_000_000));
      const result = await writeContract(
        address,
        provider,
        "register_sla",
        [
          form.service_name,
          form.service_url || `${window.location.origin}/api/service/health`,
          form.terms,
          thresholdBps,
          Number(form.window_days),
          form.compensation_type,
          compensationBps,
        ],
        depositWei,
      );
      setShowRegister(false);
      setForm(initialForm);
      setToast(result.status === "finalized" ? "Your agreement is on the line now." : "The agreement is still being decided.");
      await refresh();
    } catch (error) {
      setToast(error instanceof Error ? error.message : "The agreement could not be registered.");
    } finally {
      setBusy("");
    }
  }

  async function fileClaim(agreement: Agreement) {
    const snapshot = [...snapshots].reverse().find((item) => item.agreement_id === agreement.agreement_id);
    if (!address || !provider || !snapshot) {
      setToast("There is no signed evidence packet for this agreement yet.");
      return;
    }
    setBusy(`claim-${agreement.agreement_id}`);
    try {
      const result = await writeContract(address, provider, "file_claim", [agreement.agreement_id, snapshot.snapshot_id]);
      setToast(result.status === "finalized" ? "The validators have delivered a decision." : "Your claim is still in the queue.");
      await refresh();
    } catch (error) {
      setToast(error instanceof Error ? error.message : "The claim could not be filed.");
    } finally {
      setBusy("");
    }
  }

  async function pauseAgreement(agreement: Agreement) {
    if (!address || !provider) return;
    setBusy(`pause-${agreement.agreement_id}`);
    try {
      await writeContract(address, provider, "pause_sla", [agreement.agreement_id]);
      await refresh();
      setToast(agreement.status === "active" ? "Monitoring paused." : "Monitoring resumed.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Could not update the agreement.");
    } finally {
      setBusy("");
    }
  }

  const chartBars = Array.from({ length: 24 }, (_, index) =>
    service?.outage && index > 17 ? { height: 22 + (index % 3) * 4, down: true } : { height: 48 + (index * 17) % 43, down: false },
  );

  return (
    <main className="app-shell">
      <header className="topbar">
        <Link className="brand" href="/">
          <span className="brand-mark"><Image src="/icon.svg" alt="" width={26} height={26} priority /></span>
          <span className="brand-name">Pactline</span>
          <span className="brand-note">Claims desk</span>
        </Link>
        <nav className="top-nav" aria-label="Pactline views" role="tablist">
          <button className={`top-tab ${view === "desk" ? "selected" : ""}`} type="button" role="tab" aria-selected={view === "desk"} onClick={() => setView("desk")}>Claims desk</button>
          <button className={`top-tab ${view === "how" ? "selected" : ""}`} type="button" role="tab" aria-selected={view === "how"} onClick={() => setView("how")}>How it works</button>
        </nav>
        <div className="top-actions">
          <span className="network">Studio network</span>
          {authenticated ? (
            <>
              <span className="mono" style={{ fontSize: 11 }}>{shortAddress(address)}</span>
              <button className="icon-button" onClick={() => void disconnect()} aria-label="Sign out" title="Sign out"><LogOut size={16} /></button>
            </>
          ) : (
            <button className="primary-button" onClick={connect}><ShieldCheck size={16} /> Sign in with email</button>
          )}
        </div>
      </header>

      <section className="page">
        <AnimatePresence>
          {!authenticated && ready && (
            <motion.div className="signin" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
              <p><strong>Keep the receipt.</strong> Sign in with email to register a service and put a deposit behind its promise.</p>
              <button className="ghost-button" onClick={connect}>Get started <ArrowUpRight size={15} /></button>
            </motion.div>
          )}
        </AnimatePresence>

        {view === "desk" ? (
          <>
        <section className="hero">
          <div>
            <p className="eyebrow">Your service promise, with a paper trail</p>
            <h1>Keep the receipt when uptime goes missing.</h1>
            <p className="hero-copy">Pactline watches the service you pay for, keeps signed evidence, and gives a small claim a fair chance to finish itself.</p>
          </div>
          <div className="hero-aside">
            <span className="aside-kicker">The Pactline rule</span>
            <strong>Show the evidence. Make the call. Move on.</strong>
            <span>Every decision keeps the source URL, the signed snapshot, and the validator result beside the money.</span>
          </div>
        </section>

        <section className="stats">
          {stats.map((stat, index) => <div className={`stat stat-${index + 1}`} key={stat.label}><span className="stat-label">{stat.label}</span><strong className="stat-value">{stat.value}</strong></div>)}
        </section>

        <section className="content-grid">
          <div>
            <div className="section-head">
              <div><p className="section-kicker">Your side of the line</p><h2>Service agreements</h2><span>{authenticated ? "The promises you are keeping an eye on" : "Sign in to see your agreements"}</span></div>
              <button className="primary-button light" onClick={() => authenticated ? setShowRegister(true) : connect()}><Plus size={16} /> Add a service</button>
            </div>
            <div className="panel">
              {customerAgreements.length ? (
                <div className="agreement-list">
                  {customerAgreements.map((agreement) => {
                    const claim = recentClaims.find((item) => item.agreement_id === agreement.agreement_id);
                    const hasSnapshot = snapshots.some((item) => item.agreement_id === agreement.agreement_id);
                    return (
                      <motion.div className="agreement-row" key={agreement.agreement_id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                        <div>
                          <div className="agreement-name">{agreement.service_name}</div>
                          <div className="agreement-url">{agreement.service_url}</div>
                        </div>
                        <div><span className="row-label">Promise</span><span className="row-value">{formatUptime(agreement.threshold_bps)}</span></div>
                        <div><span className="row-label">Deposit</span><span className="row-value">{formatGen(agreement.deposit_wei)}</span></div>
                        <div>
                          <span className={`status ${claim?.status ?? agreement.status}`}>{claim?.status ?? agreement.status}</span>
                          {hasSnapshot && !claim && agreement.status !== "paused" && (
                            <button className="ghost-button" style={{ marginTop: 8, minHeight: 32, fontSize: 11 }} disabled={busy === `claim-${agreement.agreement_id}`} onClick={() => void fileClaim(agreement)}>
                              {busy === `claim-${agreement.agreement_id}` ? <RefreshCw size={13} className="spin" /> : <FileCheck2 size={13} />} File claim
                            </button>
                          )}
                          {!claim && <button className="icon-button" style={{ marginTop: 8, height: 31, width: 31 }} disabled={busy === `pause-${agreement.agreement_id}`} onClick={() => void pauseAgreement(agreement)} aria-label="Pause or resume agreement" title="Pause or resume agreement"><CloudOff size={14} /></button>}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              ) : (
                <div className="empty-state">
                  <ClipboardCheck size={27} />
                  <h3>No promises on the line yet</h3>
                  <p>Register the service you pay for. We will watch the evidence and do the awkward asking when uptime falls short.</p>
                  <button className="primary-button light" onClick={() => authenticated ? setShowRegister(true) : connect()}><Plus size={16} /> Put one on the line</button>
                </div>
              )}
            </div>

            <div className="activity">
              <div className="section-head"><div><p className="section-kicker">A short memory</p><h2>Decision log</h2><span>What Pactline has recorded lately</span></div><button className="icon-button" onClick={() => void refresh()} aria-label="Refresh data" title="Refresh data"><RefreshCw size={16} /></button></div>
              <div className="panel activity-list">
                {recentClaims.length ? recentClaims.slice(-4).reverse().map((claim) => (
                  <div className="activity-item" key={claim.claim_id}>
                    <span className="activity-icon">{claim.status === "breached" ? <CircleAlert size={16} /> : <Check size={16} />}</span>
                    <p><strong>Claim {claim.claim_id}</strong> was {claim.status === "breached" ? "approved" : "cleared"} at {formatUptime(claim.uptime_bps)}.<span>{dateLabel(claim.resolved_at)} · {claim.settlement_type === "refund" ? formatGen(claim.settlement_wei) : "credit recorded"}</span></p>
                  </div>
                )) : <div className="activity-item"><span className="activity-icon"><Activity size={16} /></span><p><strong>Nothing dramatic yet.</strong><span>Signed snapshots will appear here after the monitor runs.</span></p></div>}
              </div>
            </div>
          </div>

          <aside>
            <div className="section-head"><div><p className="section-kicker">Live evidence</p><h2>Monitor room</h2><span>The demo service is intentionally touchy</span></div></div>
            <div className="panel monitor-panel">
              <div className="monitor-status">
                <span className={`service-pulse ${service?.outage ? "down" : ""}`} />
                <div><strong>{service?.outage ? "Service is down" : "Service is answering"}</strong><span>{service?.last_checked_at ? `Last checked ${dateLabel(service.last_checked_at)}` : "Waiting for its first check"}</span></div>
              </div>
              <div className="monitor-chart" aria-label="Recent service checks">
                {chartBars.map((bar, index) => <span className={`chart-bar ${bar.down ? "down" : ""}`} style={{ height: `${bar.height}%` }} key={index} />)}
              </div>
              <div className="monitor-meta">
                <div><strong>{service ? formatUptime(service.uptime_bps) : "100.00%"}</strong><span>Rolling uptime</span></div>
                <div><strong>{service?.failed_checks ?? 0}</strong><span>Failed checks</span></div>
              </div>
              <div className="monitor-actions">
                <button className="ghost-button" disabled={busy === "service"} onClick={() => void controlService(!service?.outage)}>{service?.outage ? <Check size={14} /> : <CloudOff size={14} />}{service?.outage ? "Bring it back" : "Cause an outage"}</button>
                <button className="ghost-button" onClick={() => void refresh()}><RefreshCw size={14} /> Check again</button>
              </div>
              {lastSnapshot && <div className="detail-strip"><FileCheck2 size={15} /><span>Latest signed snapshot</span><a href={lastSnapshot.evidence_url} target="_blank" rel="noreferrer">View evidence <ArrowUpRight size={12} /></a></div>}
            </div>
            {wrongNetwork && <p className="wrong-network">Your embedded wallet could not switch to GenLayer Studio.</p>}
          </aside>
        </section>
          </>
        ) : (
          <HowItWorks onStart={() => { setView("desk"); setShowRegister(true); }} />
        )}
      </section>

      <AnimatePresence>
        {showRegister && (
          <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event: React.MouseEvent<HTMLDivElement>) => { if (event.target === event.currentTarget) setShowRegister(false); }}>
            <motion.div className="modal" initial={{ opacity: 0, y: 18, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 18, scale: 0.98 }}>
              <div className="modal-head"><div><h2>Put a promise on the line</h2><p>One deposit. One clear rule. No need to sound threatening in the subject line.</p></div><button className="icon-button" onClick={() => setShowRegister(false)} aria-label="Close registration" title="Close registration"><X size={17} /></button></div>
              <form onSubmit={submitRegistration}>
                <div className="form-grid">
                  <div className="field full"><label htmlFor="service_name">Service name</label><input id="service_name" value={form.service_name} onChange={(event) => setForm({ ...form, service_name: event.target.value })} required /></div>
                  <div className="field full"><label htmlFor="service_url">Service health URL</label><input id="service_url" type="url" placeholder="https://your-service.com/health" value={form.service_url} onChange={(event) => setForm({ ...form, service_url: event.target.value })} /></div>
                  <div className="field full"><label htmlFor="terms">SLA terms</label><textarea id="terms" value={form.terms} onChange={(event) => setForm({ ...form, terms: event.target.value })} required /></div>
                  <div className="field"><label htmlFor="threshold">Uptime threshold</label><input id="threshold" type="number" min="0.01" max="100" step="0.01" value={form.threshold} onChange={(event) => setForm({ ...form, threshold: event.target.value })} required /></div>
                  <div className="field"><label htmlFor="window_days">Measurement days</label><input id="window_days" type="number" min="1" max="365" value={form.window_days} onChange={(event) => setForm({ ...form, window_days: event.target.value })} required /></div>
                  <div className="field"><label htmlFor="compensation_type">Settlement</label><select id="compensation_type" value={form.compensation_type} onChange={(event) => setForm({ ...form, compensation_type: event.target.value })}><option value="refund">Refund in GEN</option><option value="credit">Credit recorded</option></select></div>
                  <div className="field"><label htmlFor="compensation">Settlement share</label><input id="compensation" type="number" min="0.01" max="100" step="0.01" value={form.compensation} onChange={(event) => setForm({ ...form, compensation: event.target.value })} required /></div>
                  <div className="field"><label htmlFor="deposit">Subscription deposit in GEN</label><input id="deposit" type="number" min="0.001" step="0.001" value={form.deposit} onChange={(event) => setForm({ ...form, deposit: event.target.value })} required /></div>
                </div>
                <div className="modal-footer"><span>Signed by your email wallet on GenLayer Studio</span><button className="primary-button light" disabled={busy === "register"} type="submit">{busy === "register" ? <RefreshCw size={15} className="spin" /> : <ShieldCheck size={15} />} Register agreement</button></div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>{toast && <motion.div className="toast" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }} onAnimationComplete={() => window.setTimeout(() => setToast(""), 4200)}>{toast}</motion.div>}</AnimatePresence>
    </main>
  );
}
