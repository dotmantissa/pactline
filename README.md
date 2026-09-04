# Pactline

Pactline gives software promises a place to land.

A customer registers a service, writes down the uptime rule, and places a deposit behind it. A monitor records signed evidence. When the service misses the promise, the customer can file a claim. GenLayer checks the evidence and records the result. A refund or a credit follows the decision.

The demo includes a service that can be taken offline from the dashboard. That service is real. Its state and every health check are stored in Neon. The monitor worker checks the service, signs a daily snapshot, stores the evidence packet, and publishes the snapshot to the Pactline contract.

## What is included

The `contracts` folder contains the Pactline intelligent contract. It stores agreements, deposits, snapshots, claims, and settlement results. Public evidence is fetched through `gl.nondet.web.get()`. Normalized uptime values use strict equality, so language model interpretation is not needed for a number that can be checked directly.

The `web` folder contains the Next application and its backend routes. It offers email sign in through Privy, abstract transactions through an embedded wallet, the service simulator, the Neon database routes, and the dashboard.

The `worker` folder contains the monitoring worker. It checks active services, calculates uptime, signs the evidence, and publishes snapshots to GenLayer Studio.

## Run it locally

Use Node 20 or newer and Python 3.10 or newer.

Install the web and worker dependencies:

```bash
npm --prefix web install
npm --prefix worker install
```

Copy `web/.env.example` to `web/.env.local` and fill in the database URL, the publisher secret, and the contract address. Initialise the database:

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

The direct suite covers registration, validation, access control, snapshot publication, evidence equality, duplicate claims, breach decisions, clear decisions, and settlement amounts.

```bash
genvm-lint check contracts/Pactline.py
pytest tests/direct -v
```

## Studionet deployment

Set `DEPLOYER_KEY` in the shell that runs the deployment. The key is never stored in the repository.

```bash
genlayer network set studionet
genlayer network info
npm run deploy:studionet
npm run verify:studionet
```

The deployment script records the contract address in `deploy/addresses.json` and updates the ignored browser environment file.

## Product notes

The demo service is intentionally simple. It gives the product a visible failure mode without pretending that a test fixture is production evidence. In a real integration, the service URL would belong to the customer and the monitor would run from a managed scheduler.
