"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Check,
  CircleAlert,
  ClipboardCheck,
  CloudOff,
  Filter,
  FileCheck2,
  Link2,
  LogOut,
  Plus,
  RefreshCw,
  X,
} from "lucide-react";
import { usePrivy } from "@privy-io/react-auth";
import { useWallet } from "@/components/wallet-provider";
import { formatGen, formatUptime } from "@/lib/constants";
import { canReachGenLayer, readClaims, readServices, readSnapshots, readSubscriptions, writeContract } from "@/lib/genlayer";
import type { Claim, Service, Snapshot, Subscription } from "@/lib/types";

type Role = "user" | "provider";
type View = "landing" | "how" | "app";
type ServiceFilter = "all" | "active" | "paused";
type ServiceSort = "newest" | "price" | "coverage";

type ServiceStatus = {
  outage: boolean;
  uptime_bps: number;
  total_checks: number;
  failed_checks: number;
  last_checked_at: string | null;
};

const initialServiceForm = {
  service_name: "Pactline Demo API",
  service_url: "",
  terms: "If uptime falls below the threshold, return the agreed share of the subscription price.",
  threshold: "99.90",
  window_days: "1",
  compensation_type: "refund",
  compensation: "20",
  price: "0.01",
  collateral: "0.10",
};

function shortAddress(value: string | null) {
  return value ? `${value.slice(0, 6)}...${value.slice(-4)}` : "";
}

function LandingPage({ onStart, onHow, services, dataUnavailable }: { onStart: () => void; onHow: () => void; services: Service[]; dataUnavailable: boolean }) {
  const activeServices = services.filter((service) => service.status === "active").length;
  const postedCoverage = services.reduce((sum, service) => sum + service.collateral_wei, 0);
  return (
    <section className="landing-page" aria-labelledby="landing-title">
      <div className="landing-hero">
        <div className="landing-hero-copy">
          <p className="eyebrow">A clearer record for software people rely on</p>
          <h1 id="landing-title">Clear terms for services people rely on.</h1>
          <p className="hero-copy">Pactline gives providers a place to publish uptime terms and collateral. Subscribers can review the terms, follow the evidence, and file a claim when a measurement window shows a shortfall. Less guesswork, fewer email threads.</p>
          <div className="landing-actions">
            <button className="primary-button light" onClick={onStart}><Link2 size={16} /> Join Pactline</button>
            <button className="ghost-button" onClick={onHow}>See how it works <ArrowRight size={15} /></button>
          </div>
        </div>
        <div className="landing-proof">
          <div className="proof-label">Coverage directory</div>
          <div className="proof-metrics">
            <div><strong>{dataUnavailable ? "—" : services.length}</strong><span>services listed</span></div>
            <div><strong>{dataUnavailable ? "—" : activeServices}</strong><span>open for signup</span></div>
            <div><strong>{dataUnavailable ? "—" : formatGen(postedCoverage)}</strong><span>coverage posted</span></div>
          </div>
          <div className="proof-line"><span className="proof-dot provider" /><span>Provider posts terms</span><Check size={15} /></div>
          <div className="proof-line"><span className="proof-dot evidence" /><span>Monitor signs the evidence</span><Check size={15} /></div>
          <div className="proof-line"><span className="proof-dot payout" /><span>Subscriber receives the result</span><Check size={15} /></div>
          <div className="proof-note">{dataUnavailable ? "The live directory is temporarily unavailable." : services.length ? "The directory is live on GenLayer Studio." : "The first provider listing will open the directory."}</div>
        </div>
      </div>

      <div className="landing-audience">
        <div className="landing-audience-intro">
          <p className="section-kicker">Two sides, one fair rule</p>
          <h2>One service record. Two clearer jobs.</h2>
        </div>
        <div className="audience-row">
          <div><span className="audience-number">01</span><h3>For providers</h3></div>
          <p>Publish the terms customers will see, attach collateral, and give the service a measurable standard.</p>
        </div>
        <div className="audience-row">
          <div><span className="audience-number">02</span><h3>For subscribers</h3></div>
          <p>Review the terms before paying. If published evidence shows a breach after the window closes, file the claim from your workspace.</p>
        </div>
      </div>

      <div className="landing-footer-cta">
        <div><p className="section-kicker">The short version</p><h2>Less arguing about uptime. More clarity about what happens next.</h2></div>
        <button className="primary-button" onClick={onStart}>Choose your role <ArrowUpRight size={15} /></button>
      </div>
    </section>
  );
}

function RolePicker({ onClose, onContinue }: { onClose: () => void; onContinue: (role: Role) => void }) {
  const [selected, setSelected] = useState<Role | null>(null);
  return (
    <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <motion.div className="role-modal" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 18 }}>
        <div className="modal-head"><div><p className="section-kicker">Before the email</p><h2>Which workspace fits your work?</h2><p>Choose how you will use Pactline and we will open the right workspace after sign in.</p></div><button className="icon-button" onClick={onClose} aria-label="Close role selection" title="Close role selection"><X size={17} /></button></div>
        <div className="role-options">
          <button className={`role-option ${selected === "user" ? "selected" : ""}`} onClick={() => setSelected("user")} type="button">
            <span className="role-option-icon"><ClipboardCheck size={20} /></span>
            <span><strong>User</strong><small>Subscribe to listed services and file a claim when published evidence shows a shortfall.</small></span>
            {selected === "user" && <Check size={17} />}
          </button>
          <button className={`role-option ${selected === "provider" ? "selected" : ""}`} onClick={() => setSelected("provider")} type="button">
            <span className="role-option-icon"><BadgeCheck size={20} /></span>
            <span><strong>Provider</strong><small>List a service, define its terms, and keep collateral available for valid claims.</small></span>
            {selected === "provider" && <Check size={17} />}
          </button>
        </div>
        <div className="role-footer"><span>Email sign in with an embedded wallet. No wallet juggling.</span><button className="primary-button light" disabled={!selected} onClick={() => selected && onContinue(selected)}>Continue with email <ArrowRight size={15} /></button></div>
      </motion.div>
    </motion.div>
  );
}

function HowItWorks({ onStart }: { onStart: () => void }) {
  return (
    <section className="how-page" aria-labelledby="how-title">
      <div className="how-intro">
        <div>
          <p className="eyebrow">A practical record for uptime terms</p>
          <h1 id="how-title">See the rule before the outage.</h1>
          <p className="hero-copy">Providers publish terms and collateral. Subscribers choose a service, and Pactline keeps the measurement evidence and claim result together.</p>
        </div>
        <div className="how-summary">
          <span className="aside-kicker">The whole idea</span>
          <strong>Terms. Evidence. A decision.</strong>
          <p>The provider sets the rule and posts collateral before subscribers join.</p>
        </div>
      </div>

      <div className="how-steps">
        <article className="how-step"><div className="step-topline"><span className="step-number">01</span><Link2 size={19} /></div><h2>Provider lists the service</h2><p>A provider registers a public health URL, writes the uptime terms, chooses the subscriber price, and deposits collateral.</p><div className="step-detail"><Check size={14} /> The provider defines the promise</div></article>
        <article className="how-step"><div className="step-topline"><span className="step-number">02</span><ClipboardCheck size={19} /></div><h2>Subscriber joins</h2><p>A subscriber picks a listed service and pays its published price. The contract reserves provider collateral for the compensation rule.</p><div className="step-detail"><Check size={14} /> Terms are visible first</div></article>
        <article className="how-step"><div className="step-topline"><span className="step-number">03</span><Activity size={19} /></div><h2>Monitor publishes evidence</h2><p>The monitor checks the registered health URL and publishes a signed snapshot linked to the service. The evidence has a source and a period.</p><div className="step-detail"><FileCheck2 size={14} /> Signed uptime evidence</div></article>
        <article className="how-step"><div className="step-topline"><span className="step-number">04</span><CircleAlert size={19} /></div><h2>Claim is reviewed</h2><p>After the measurement window ends, the subscriber can file a claim. GenLayer checks the evidence against the published terms and records the result.</p><div className="step-detail"><Check size={14} /> A result the contract can keep</div></article>
      </div>

      <section className="how-benefits"><div><p className="section-kicker">Why use Pactline</p><h2>A smaller, clearer process for service shortfalls.</h2></div><div className="benefit-list"><div className="benefit-item"><BadgeCheck size={18} /><div><strong>Make terms visible</strong><p>Providers can show the rule and the collateral attached to a listing.</p></div></div><div className="benefit-item"><FileCheck2 size={18} /><div><strong>Keep evidence together</strong><p>Subscribers can find the service terms, snapshot, and result in one place.</p></div></div><div className="benefit-item"><ClipboardCheck size={18} /><div><strong>Give small claims a process</strong><p>A modest claim should not require a week of polite follow up emails.</p></div></div></div></section>
      <section className="how-start"><div><p className="section-kicker">Ready when you are</p><h2>Choose a side and get to work.</h2><p>Providers can list a service. Users can browse coverage.</p></div><button className="primary-button light" onClick={onStart}>Choose your role <ArrowRight size={15} /></button></section>
    </section>
  );
}

function ServiceCard({ service, subscribed, busy, onSubscribe, isProvider }: { service: Service; subscribed: boolean; busy: boolean; onSubscribe: () => void; isProvider: boolean }) {
  return (
    <article className="service-card">
      <div className="service-card-top"><span className={`status ${service.status}`}>{service.status}</span><span className="mono service-id">Service {service.service_id}</span></div>
      <h3>{service.service_name}</h3>
      <p className="service-terms">{service.terms}</p>
      <div className="service-facts"><div><span>Uptime promise</span><strong>{formatUptime(service.threshold_bps)}</strong></div><div><span>Compensation</span><strong>{service.compensation_bps / 100}% {service.compensation_type}</strong></div><div><span>Subscription</span><strong>{formatGen(service.subscription_price_wei)}</strong></div></div>
      <div className="service-card-footer"><span><span className="service-provider-label">Provider</span>{shortAddress(service.provider)}</span>{isProvider ? <span className="service-note">Your listing</span> : subscribed ? <span className="service-note">Subscribed</span> : <button className="primary-button light compact" disabled={busy} onClick={onSubscribe}>{busy ? <RefreshCw size={13} className="spin" /> : <Plus size={13} />} Subscribe</button>}</div>
    </article>
  );
}

function ProviderWorkspace({ address, services, busy, dataUnavailable, onRegister, onCollateral, onPause }: { address: string; services: Service[]; busy: string; dataUnavailable: boolean; onRegister: () => void; onCollateral: (service: Service) => void; onPause: (service: Service) => void }) {
  const ownServices = services.filter((service) => service.provider.toLowerCase() === address.toLowerCase());
  return (
    <section className="workspace" aria-labelledby="workspace-title">
      <div className="workspace-intro"><div><p className="eyebrow">Provider workspace</p><h1 id="workspace-title">Give the service a rule people can inspect.</h1><p className="hero-copy">List the service, set the terms, and keep collateral available for the compensation rule your customers will see.</p></div><button className="primary-button light" onClick={onRegister}><Plus size={16} /> List a service</button></div>
      {dataUnavailable && <div className="data-notice" role="status"><CircleAlert size={15} /> Live contract data is temporarily unavailable. Try again shortly.</div>}
      <div className="workspace-stats"><div><span>Services listed</span><strong>{ownServices.length}</strong></div><div><span>Coverage posted</span><strong>{formatGen(ownServices.reduce((sum, service) => sum + service.collateral_wei, 0))}</strong></div><div><span>Subscribers</span><strong>{ownServices.reduce((sum, service) => sum + service.subscriber_count, 0)}</strong></div></div>
      <div className="section-head"><div><p className="section-kicker">Your listings</p><h2>Services with a promise behind them</h2><span>Every listing is monitored from its registered health URL.</span></div></div>
      {ownServices.length ? <div className="service-directory">{ownServices.map((service) => <article className="provider-service" key={service.service_id}><div><span className={`status ${service.status}`}>{service.status}</span><h3>{service.service_name}</h3><p>{service.service_url}</p></div><div className="provider-service-facts"><div><span>Collateral</span><strong>{formatGen(service.collateral_wei)}</strong></div><div><span>Reserved</span><strong>{formatGen(service.reserved_wei)}</strong></div><div><span>Revenue</span><strong>{formatGen(service.provider_revenue_wei)}</strong></div></div><div className="provider-service-actions"><button className="ghost-button compact" onClick={() => onCollateral(service)}><Plus size={13} /> Add collateral</button><button className="icon-button compact-icon" disabled={busy === `pause-${service.service_id}`} onClick={() => onPause(service)} aria-label="Pause or resume service" title="Pause or resume service"><CloudOff size={14} /></button></div></article>)}</div> : <div className="empty-state provider-empty"><Link2 size={27} /><h3>Nothing listed yet</h3><p>Your first service listing sets the terms customers will see and the collateral they can trust.</p><button className="primary-button light" onClick={onRegister}><Plus size={16} /> List your first service</button></div>}
    </section>
  );
}

function UserWorkspace({ services, subscriptions, claims, snapshots, address, busy, dataUnavailable, onSubscribe, onClaim, onRefresh }: { services: Service[]; subscriptions: Subscription[]; claims: Claim[]; snapshots: Snapshot[]; address: string; busy: string; dataUnavailable: boolean; onSubscribe: (service: Service) => void; onClaim: (subscription: Subscription, snapshot: Snapshot) => void; onRefresh: () => void }) {
  const [now, setNow] = useState(0);
  const [serviceFilter, setServiceFilter] = useState<ServiceFilter>("all");
  const [serviceSort, setServiceSort] = useState<ServiceSort>("newest");
  const mySubscriptions = subscriptions.filter((item) => item.customer.toLowerCase() === address.toLowerCase());
  const myClaims = claims.filter((item) => item.customer.toLowerCase() === address.toLowerCase());
  const subscribedIds = new Set(mySubscriptions.map((item) => item.service_id));
  const visibleServices = services
    .filter((service) => serviceFilter === "all" || service.status === serviceFilter)
    .sort((left, right) => {
      if (serviceSort === "price") return left.subscription_price_wei - right.subscription_price_wei;
      if (serviceSort === "coverage") return right.collateral_wei - left.collateral_wei;
      return right.created_at - left.created_at;
    });
  useEffect(() => {
    // Keep claim availability aligned with the provider published window.
    // The contract remains the final authority when the transaction is sent.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <section className="workspace" aria-labelledby="workspace-title">
      <div className="workspace-intro"><div><p className="eyebrow">User workspace</p><h1 id="workspace-title">Choose services with terms you can read.</h1><p className="hero-copy">Browse the directory, compare terms and prices, and keep the evidence close if a service falls short.</p></div><button className="icon-button" onClick={onRefresh} aria-label="Refresh marketplace" title="Refresh marketplace"><RefreshCw size={16} /></button></div>
      {dataUnavailable && <div className="data-notice" role="status"><CircleAlert size={15} /> Live contract data is temporarily unavailable. Try again shortly.</div>}
      <div className="workspace-stats"><div><span>Listed services</span><strong>{services.length}</strong></div><div><span>Your subscriptions</span><strong>{mySubscriptions.length}</strong></div><div><span>Compensation received</span><strong>{formatGen(myClaims.reduce((sum, claim) => sum + claim.settlement_wei, 0))}</strong></div></div>
      <div className="section-head directory-head"><div><p className="section-kicker">Service directory</p><h2>Choose your coverage</h2><span>Provider terms are visible before you subscribe.</span></div><div className="directory-controls"><label><Filter size={14} /><span className="sr-only">Filter services</span><select value={serviceFilter} onChange={(event) => setServiceFilter(event.target.value as ServiceFilter)}><option value="all">All services</option><option value="active">Open for signup</option><option value="paused">Paused listings</option></select></label><label><span className="sr-only">Sort services</span><select value={serviceSort} onChange={(event) => setServiceSort(event.target.value as ServiceSort)}><option value="newest">Newest first</option><option value="price">Lowest price</option><option value="coverage">Most coverage</option></select></label></div></div>
      {visibleServices.length ? <div className="service-directory">{visibleServices.map((service) => <ServiceCard key={service.service_id} service={service} subscribed={subscribedIds.has(service.service_id)} busy={busy === `subscribe-${service.service_id}`} onSubscribe={() => onSubscribe(service)} isProvider={false} />)}</div> : <div className="empty-state"><ClipboardCheck size={27} /><h3>{services.length ? "No services match that view" : "No services have opened their doors yet"}</h3><p>{services.length ? "Try another filter and the directory will show what is available." : "Once a provider lists a service, its terms and coverage will appear here."}</p></div>}
      <div className="activity user-claims"><div className="section-head"><div><p className="section-kicker">Your coverage</p><h2>Subscriptions and claims</h2><span>Evidence and settlement history for your account.</span></div></div><div className="panel activity-list">{mySubscriptions.length ? mySubscriptions.map((subscription) => { const service = services.find((item) => item.service_id === subscription.service_id); const snapshot = [...snapshots].reverse().find((item) => item.service_id === subscription.service_id); const existingClaim = claims.find((claim) => claim.subscription_id === subscription.subscription_id && claim.snapshot_id === snapshot?.snapshot_id); const windowClosed = snapshot ? now > 0 && Date.parse(snapshot.period_end) <= now : false; return <div className="subscription-row" key={subscription.subscription_id}><div><strong>{service?.service_name ?? `Service ${subscription.service_id}`}</strong><span>Subscription {subscription.subscription_id} | {formatGen(subscription.subscription_price_wei)}</span></div><div><span className="row-label">Maximum claim</span><strong>{formatGen(subscription.max_payout_wei)}</strong></div><div>{existingClaim ? <span className={`status ${existingClaim.status}`}>{existingClaim.status}</span> : snapshot && windowClosed ? <button className="ghost-button compact" disabled={busy === `claim-${subscription.subscription_id}`} onClick={() => onClaim(subscription, snapshot)}>{busy === `claim-${subscription.subscription_id}` ? <RefreshCw size={13} className="spin" /> : <FileCheck2 size={13} />} File claim</button> : snapshot ? <span className="service-note">Window closes {new Date(snapshot.period_end).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span> : <span className="service-note">Waiting for evidence</span>}</div></div>; }) : <div className="activity-item"><span className="activity-icon"><Activity size={16} /></span><p><strong>Nothing covered yet.</strong><span>Subscribe to a listed service and its evidence will show up here.</span></p></div>}</div></div>
    </section>
  );
}

export default function Home() {
  const { ready, authenticated, user } = usePrivy();
  const { address, provider, connect, disconnect, wrongNetwork } = useWallet();
  const [services, setServices] = useState<Service[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [demoService, setDemoService] = useState<ServiceStatus | null>(null);
  const [showRegister, setShowRegister] = useState(false);
  const [showRolePicker, setShowRolePicker] = useState(false);
  const [serviceForm, setServiceForm] = useState(initialServiceForm);
  const [busy, setBusy] = useState("");
  const [toast, setToast] = useState("");
  const [role, setRole] = useState<Role | null>(null);
  const [view, setView] = useState<View>("landing");
  const [dataUnavailable, setDataUnavailable] = useState(false);

  const refresh = useCallback(async () => {
    const rpcReady = await canReachGenLayer();
    let contractFailed = !rpcReady;
    if (rpcReady) {
      const results = await Promise.allSettled([readServices(), readSubscriptions(), readSnapshots(), readClaims()]);
      const [servicesResult, subscriptionsResult, snapshotsResult, claimsResult] = results;
      if (servicesResult.status === "fulfilled") setServices(servicesResult.value);
      else contractFailed = true;
      if (subscriptionsResult.status === "fulfilled") setSubscriptions(subscriptionsResult.value);
      else contractFailed = true;
      if (snapshotsResult.status === "fulfilled") setSnapshots(snapshotsResult.value);
      else contractFailed = true;
      if (claimsResult.status === "fulfilled") setClaims(claimsResult.value);
      else contractFailed = true;
    }
    setDataUnavailable(contractFailed);

    if (authenticated && role === "provider") {
      const statusResult = await Promise.allSettled([
        fetch("/api/service/status", { cache: "no-store" }).then(async (response) => {
          if (!response.ok) throw new Error("Service status unavailable");
          return (await response.json()) as ServiceStatus;
        }),
      ]);
      const result = statusResult[0];
      setDemoService(result.status === "fulfilled" ? result.value : null);
    } else {
      setDemoService(null);
    }
  }, [authenticated, role]);

  useEffect(() => {
    // Load public listings and evidence as soon as the app opens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    if (!authenticated || !address) return;
    const key = `pactline-role:${address.toLowerCase()}`;
    const stored = localStorage.getItem(key) as Role | null;
    const pending = localStorage.getItem("pactline-pending-role") as Role | null;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored === "user" || stored === "provider") setRole(stored);
    else if (pending === "user" || pending === "provider") {
      localStorage.setItem(key, pending);
      localStorage.removeItem("pactline-pending-role");
      setRole(pending);
    } else setShowRolePicker(true);
    setView("app");
  }, [address, authenticated]);

  const email = user?.linkedAccounts?.find((account) => account.type === "email")?.address ?? "";
  const currentRole = role;
  function startAuth() {
    if (authenticated && role) {
      setView("app");
      return;
    }
    setShowRolePicker(true);
  }

  function chooseRole(nextRole: Role) {
    if (authenticated && address) {
      localStorage.setItem(`pactline-role:${address.toLowerCase()}`, nextRole);
      localStorage.removeItem("pactline-pending-role");
    } else {
      localStorage.setItem("pactline-pending-role", nextRole);
    }
    setRole(nextRole);
    setShowRolePicker(false);
    if (!authenticated) void connect();
  }

  async function controlDemo(outage: boolean) {
    setBusy("demo");
    try {
      const response = await fetch("/api/service/control", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ outage }) });
      if (!response.ok) throw new Error("The demo service control did not respond.");
      setToast(outage ? "The demo service is now having a difficult day." : "The demo service is back on its feet.");
      await refresh();
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Could not update the demo service.");
    } finally {
      setBusy("");
    }
  }

  async function registerService(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!address || !provider) {
      startAuth();
      return;
    }
    setBusy("register");
    try {
      const priceWei = BigInt(Math.round(Number(serviceForm.price) * 1_000_000_000_000_000_000));
      const collateralWei = BigInt(Math.round(Number(serviceForm.collateral) * 1_000_000_000_000_000_000));
      const result = await writeContract(address, provider, "register_service", [serviceForm.service_name, serviceForm.service_url || `${window.location.origin}/api/service/health`, serviceForm.terms, Math.round(Number(serviceForm.threshold) * 100), Number(serviceForm.window_days), serviceForm.compensation_type, Math.round(Number(serviceForm.compensation) * 100), priceWei], collateralWei);
      setShowRegister(false);
      setServiceForm(initialServiceForm);
      setToast(result.status === "finalized" ? "Your service is listed. The terms are now on the contract." : "Your service listing is still being decided.");
      await refresh();
    } catch (error) {
      setToast(error instanceof Error ? error.message : "The service could not be listed.");
    } finally {
      setBusy("");
    }
  }

  async function subscribe(service: Service) {
    if (!address || !provider) {
      startAuth();
      return;
    }
    setBusy(`subscribe-${service.service_id}`);
    try {
      const result = await writeContract(address, provider, "subscribe_service", [service.service_id], BigInt(service.subscription_price_wei));
      setToast(result.status === "finalized" ? `You are subscribed to ${service.service_name}.` : "Your subscription is still being decided.");
      await refresh();
    } catch (error) {
      setToast(error instanceof Error ? error.message : "The subscription could not be completed.");
    } finally {
      setBusy("");
    }
  }

  async function fileClaim(subscription: Subscription, snapshot: Snapshot) {
    if (!address || !provider) return;
    setBusy(`claim-${subscription.subscription_id}`);
    try {
      const result = await writeContract(address, provider, "file_claim", [subscription.subscription_id, snapshot.snapshot_id]);
      setToast(result.status === "finalized" ? "The contract recorded the claim result." : "Your claim is still being decided.");
      await refresh();
    } catch (error) {
      setToast(error instanceof Error ? error.message : "The claim could not be filed.");
    } finally {
      setBusy("");
    }
  }

  async function addCollateral(service: Service) {
    if (!address || !provider) return;
    const amount = window.prompt(`How much GEN should be added to ${service.service_name}'s coverage pool?`, "0.10");
    if (!amount || Number(amount) <= 0) return;
    setBusy(`collateral-${service.service_id}`);
    try {
      await writeContract(address, provider, "add_service_collateral", [service.service_id], BigInt(Math.round(Number(amount) * 1_000_000_000_000_000_000)));
      setToast("Coverage collateral added.");
      await refresh();
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Collateral could not be added.");
    } finally {
      setBusy("");
    }
  }

  async function pauseService(service: Service) {
    if (!address || !provider) return;
    setBusy(`pause-${service.service_id}`);
    try {
      await writeContract(address, provider, "pause_service", [service.service_id]);
      setToast(service.status === "active" ? "New subscriptions are paused." : "The service is accepting subscriptions again.");
      await refresh();
    } catch (error) {
      setToast(error instanceof Error ? error.message : "The service status could not be changed.");
    } finally {
      setBusy("");
    }
  }

  const chartBars = Array.from({ length: 24 }, (_, index) => demoService?.outage && index > 17 ? { height: 22 + (index % 3) * 4, down: true } : { height: 48 + (index * 17) % 43, down: false });

  return (
    <main className="app-shell">
      <header className="topbar">
        <Link className="brand" href="/" onClick={() => setView(authenticated ? "app" : "landing")}><span className="brand-mark"><Image src="/icon.svg" alt="" width={26} height={26} priority /></span><span className="brand-name">Pactline</span><span className="brand-note">SLA coverage</span></Link>
        <nav className="top-nav" aria-label="Pactline views" role="tablist">
          <button className={`top-tab ${(authenticated ? view === "app" : view === "landing") ? "selected" : ""}`} type="button" role="tab" aria-selected={authenticated ? view === "app" : view === "landing"} onClick={() => setView(authenticated ? "app" : "landing")}>{authenticated ? "Workspace" : "Home"}</button>
          <button className={`top-tab ${view === "how" ? "selected" : ""}`} type="button" role="tab" aria-selected={view === "how"} onClick={() => setView("how")}>How it works</button>
        </nav>
        <div className="top-actions"><span className="network">Studio network</span>{authenticated ? <><span className="mono top-email">{email || shortAddress(address)}</span><button className="icon-button" onClick={() => void disconnect()} aria-label="Sign out" title="Sign out"><LogOut size={16} /></button></> : <button className="primary-button" onClick={startAuth}><Link2 size={16} /> Sign in with email</button>}</div>
      </header>

      <section className="page">
        <AnimatePresence>
          {!authenticated && ready && view === "landing" && <motion.div className="signin" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}><p><strong>Provider or user?</strong> Choose your role before the email screen and Pactline will set up the right workspace.</p><button className="ghost-button" onClick={startAuth}>Choose a role <ArrowUpRight size={15} /></button></motion.div>}
        </AnimatePresence>

        {view === "how" ? <HowItWorks onStart={startAuth} /> : authenticated && currentRole === "provider" && address ? <ProviderWorkspace address={address} services={services} busy={busy} dataUnavailable={dataUnavailable} onRegister={() => setShowRegister(true)} onCollateral={(service) => void addCollateral(service)} onPause={(service) => void pauseService(service)} /> : authenticated && currentRole === "user" && address ? <UserWorkspace address={address} services={services} subscriptions={subscriptions} claims={claims} snapshots={snapshots} busy={busy} dataUnavailable={dataUnavailable} onSubscribe={(service) => void subscribe(service)} onClaim={(subscription, snapshot) => void fileClaim(subscription, snapshot)} onRefresh={() => void refresh()} /> : <LandingPage services={services} dataUnavailable={dataUnavailable} onStart={startAuth} onHow={() => setView("how")} />}

        {wrongNetwork && <p className="wrong-network">Your embedded wallet could not switch to GenLayer Studio.</p>}
        {authenticated && currentRole === "provider" && demoService && <div className="provider-demo-strip"><span className={`service-pulse ${demoService.outage ? "down" : ""}`} /><span>Demo monitor {demoService.outage ? "is down" : "is answering"} at {formatUptime(demoService.uptime_bps)}.</span><button className="ghost-button compact" disabled={busy === "demo"} onClick={() => void controlDemo(!demoService.outage)}>{demoService.outage ? <Check size={13} /> : <CloudOff size={13} />}{demoService.outage ? "Bring it back" : "Cause an outage"}</button><div className="mini-chart">{chartBars.map((bar, index) => <span className={bar.down ? "down" : ""} style={{ height: `${bar.height}%` }} key={index} />)}</div></div>}
      </section>

      <AnimatePresence>
        {showRolePicker && <RolePicker onClose={() => setShowRolePicker(false)} onContinue={chooseRole} />}
        {showRegister && <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => { if (event.target === event.currentTarget) setShowRegister(false); }}><motion.div className="modal" initial={{ opacity: 0, y: 18, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 18, scale: 0.98 }}><div className="modal-head"><div><p className="section-kicker">Provider listing</p><h2>Put a service on the line</h2><p>These are the terms customers will see before they subscribe.</p></div><button className="icon-button" onClick={() => setShowRegister(false)} aria-label="Close service listing" title="Close service listing"><X size={17} /></button></div><form onSubmit={registerService}><div className="form-grid"><div className="field full"><label htmlFor="service_name">Service name</label><input id="service_name" value={serviceForm.service_name} onChange={(event) => setServiceForm({ ...serviceForm, service_name: event.target.value })} required /></div><div className="field full"><label htmlFor="service_url">Service health URL</label><input id="service_url" type="url" placeholder="https://your-service.com/health" value={serviceForm.service_url} onChange={(event) => setServiceForm({ ...serviceForm, service_url: event.target.value })} /></div><div className="field full"><label htmlFor="terms">Provider terms</label><textarea id="terms" value={serviceForm.terms} onChange={(event) => setServiceForm({ ...serviceForm, terms: event.target.value })} required /></div><div className="field"><label htmlFor="threshold">Uptime threshold</label><input id="threshold" type="number" min="0.01" max="100" step="0.01" value={serviceForm.threshold} onChange={(event) => setServiceForm({ ...serviceForm, threshold: event.target.value })} required /></div><div className="field"><label htmlFor="window_days">Measurement days</label><input id="window_days" type="number" min="1" max="365" value={serviceForm.window_days} onChange={(event) => setServiceForm({ ...serviceForm, window_days: event.target.value })} required /></div><div className="field"><label htmlFor="compensation_type">Compensation</label><select id="compensation_type" value={serviceForm.compensation_type} onChange={(event) => setServiceForm({ ...serviceForm, compensation_type: event.target.value })}><option value="refund">Refund in GEN</option><option value="credit">Service credit recorded</option></select></div><div className="field"><label htmlFor="compensation">Compensation share</label><input id="compensation" type="number" min="0.01" max="100" step="0.01" value={serviceForm.compensation} onChange={(event) => setServiceForm({ ...serviceForm, compensation: event.target.value })} required /></div><div className="field"><label htmlFor="price">Subscription price in GEN</label><input id="price" type="number" min="0.001" step="0.001" value={serviceForm.price} onChange={(event) => setServiceForm({ ...serviceForm, price: event.target.value })} required /></div><div className="field"><label htmlFor="collateral">Coverage collateral in GEN</label><input id="collateral" type="number" min="0.001" step="0.001" value={serviceForm.collateral} onChange={(event) => setServiceForm({ ...serviceForm, collateral: event.target.value })} required /></div></div><div className="modal-footer"><span>Provider collateral funds valid subscriber claims.</span><button className="primary-button light" disabled={busy === "register"} type="submit">{busy === "register" ? <RefreshCw size={15} className="spin" /> : <Link2 size={15} />} List service</button></div></form></motion.div></motion.div>}
      </AnimatePresence>
      <AnimatePresence>{toast && <motion.div className="toast" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }} onAnimationComplete={() => window.setTimeout(() => setToast(""), 4200)}>{toast}</motion.div>}</AnimatePresence>
    </main>
  );
}
