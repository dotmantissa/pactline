# Pactline

Pactline is a provider marketplace for software reliability.

A provider lists a service, writes the uptime terms, chooses the subscription price, and deposits collateral. A user subscribes to that service through Pactline. The monitor records signed uptime evidence. When the measurement window ends, the user can file a claim. GenLayer checks the evidence against the provider terms and the contract records the result. A valid refund is paid from the provider collateral. A credit is recorded for services that use credit compensation.

The point is simple: a reliability promise should have a clear rule, visible evidence, and somewhere for the compensation to come from.

## What is included

The `contracts` folder contains the Pactline intelligent contract. It stores provider listings, subscription payments, collateral reservations, signed snapshots, claims, and settlement results. Public evidence is fetched through `gl.nondet.web.get()`. Normalized uptime values use strict equality, so language model interpretation is not needed for a number that can be checked directly. GenLayer consensus is reserved for the parts of a claim that need interpretation.

The `web` folder contains the Next application and its backend routes. It offers email sign in through Privy, abstract transactions through an embedded wallet, a public landing page, a role based provider or user workspace, the service simulator, and the Neon database routes.

The `worker` folder contains the monitoring worker. It reads active services from the contract, checks each registered health URL, calculates uptime, signs the evidence, stores the packet, and publishes snapshots to GenLayer Studio.

## Run it locally

Use Node 20 or newer and Python 3.10 or newer.

Install the web and worker dependencies:

```bash
npm --prefix web install
npm --prefix worker install
```

Copy `web/.env.example` to `web/.env.local` and add the database URL, publisher secret, monitor key, and contract address. Keep private values outside the repository. Initialise the database:

```bash
npm --prefix web run db:init
```

Start the dashboard:

```bash
npm run dev
```

Start the monitor in another terminal:

```bash
npm run dev:worker
```

The dashboard opens at `http://localhost:3000`.

## Contract checks

The direct suite covers provider registration, collateral validation, provider access control, subscriptions, reservation limits, paused services, snapshot publication, evidence equality, duplicate claims, breach decisions, clear decisions, and settlement amounts.

```bash
genvm-lint check contracts/Pactline.py
pytest tests/direct -v
```

## Studionet deployment

Set `DEPLOYER_KEY` in the shell that runs the deployment. Keep the key outside the repository.

```bash
genlayer network set studionet
genlayer network info
npm run deploy:studionet
npm run verify:studionet
```

The deployment script records the contract address in `deploy/addresses.json` and updates the ignored browser environment file.

## Product notes

The demo service is intentionally simple. It gives the product a visible failure mode without pretending that a test fixture is production evidence. Providers can use their own public health URL when they list a service. The monitor can then run from a managed scheduler and publish one signed snapshot per measurement window.

The main contract methods are:

* `register_service` for provider listings and initial collateral
* `add_service_collateral` for adding coverage
* `subscribe_service` for user subscriptions
* `publish_snapshot` for monitor evidence
* `file_claim` for evidence based resolution
* `pause_service` for stopping new subscriptions
* `withdraw_provider_revenue` for provider subscription revenue
