/**
 * Capital Markets -- Industry Outcome Map
 *
 * Strategic imperatives and pillars are sourced verbatim from the Master
 * Repository XLSX (Use Case Summaries sheet). Use case names and short
 * descriptions come from the same source. Rich enrichment fields (model
 * type, KPI, benchmarks, data asset linkage, MC/VA, economic patterns)
 * live in capital-markets.enrichment.ts and are produced by the master repo seed.
 */

import type { IndustryOutcome } from "./index";

export const CAPITAL_MARKETS: IndustryOutcome = {
  id: "capital-markets",
  name: "Capital Markets",
  subVerticals: ["Investment Banks","Asset Managers","Hedge Funds","Broker-Dealers","Custody & Clearing"],
  suggestedDomains: ["Trading","Risk","Compliance","Investment Research","Operations","Treasury"],
  suggestedPriorities: ["Drive Growth","Protect the Firm","Be More Efficient"],
  objectives: [
    {
      name: "Drive Growth",
      whyChange: "Investment analytics, advisory, and trading analytics unlock alpha and client growth across the franchise.",
      priorities: [
        {
          name: "Investment Analytics",
          useCases: [
            {
              name: "Market Intelligence",
              description: "Consolidated view of markets, sectors, and issuers to surface actionable signals for sales, trading, and research.",
            },
            {
              name: "Backtesting",
              description: "Evaluate strategies across regimes with robust slippage/latency-aware simulations.",
            },
            {
              name: "Portfolio construction & Optimization",
              description: "Build efficient portfolios under constraints and client objectives.",
            },
            {
              name: "Alternative Data & ESG Analytics",
              description: "Harvest alpha and risk insights from non-traditional sources with auditability.",
            },
          ],
          kpis: ["Alpha generated","AUM growth","Trade execution quality","Advisory revenue"],
          personas: ["Head of Trading","Chief Investment Officer","Head of Research"],
        },
        {
          name: "Investment Advisory",
          useCases: [
            {
              name: "Personalized Investment Advice",
              description: "Tailors advice to client goals, suitability, and preferences with explainability.",
            },
            {
              name: "Sales & Trading Intelligences",
              description: "Surfaces client opportunities and execution improvements to boost wallet share.",
            },
            {
              name: "M&A Automation and Integration",
              description: "Automates diligence, clause extraction, and post-merger data mapping.",
            },
          ],
          kpis: ["Alpha generated","AUM growth","Trade execution quality","Advisory revenue"],
          personas: ["Head of Trading","Chief Investment Officer","Head of Research"],
        },
        {
          name: "Trading Analytics",
          useCases: [
            {
              name: "Real-Time Market Analysis",
              description: "Monitors moves and drivers across assets and venues with alerting.",
            },
            {
              name: "Transaction Cost Analysis (TCA)",
              description: "Quantifies execution quality and optimizes routing/algo selection.",
            },
            {
              name: "Predictive Analytics and Forecasting",
              description: "Forecast returns/volatility/flows for risk and alpha.",
            },
            {
              name: "Algorithmic Trading",
              description: "Designs and orchestrates low-latency strategies with risk controls.",
            },
          ],
          kpis: ["Alpha generated","AUM growth","Trade execution quality","Advisory revenue"],
          personas: ["Head of Trading","Chief Investment Officer","Head of Research"],
        },
      ],
    },
    {
      name: "Protect the Firm",
      whyChange: "Risk, cybersecurity, fraud, and compliance protect license to operate and avoid material loss.",
      priorities: [
        {
          name: "Risk Management",
          useCases: [
            {
              name: "Market Risk",
              description: "Daily VaR/stress and sensitivities for portfolios.",
            },
            {
              name: "Credit Risk",
              description: "Probability of default/LGD/EAD and limit setting.",
            },
            {
              name: "Counterparty Risk",
              description: "PFE/wrong-way risk and concentration monitoring.",
            },
          ],
          kpis: ["VaR exceedances","Loss events","Surveillance alerts","Time-to-detect"],
          personas: ["Chief Risk Officer","Chief Compliance Officer","CISO"],
        },
        {
          name: "Cybersecurity",
          useCases: [
            {
              name: "User & Entity Behavior Analytics",
              description: "Detect anomalous employee/client behaviors.",
            },
            {
              name: "Threat Hunting & Advanced Detection",
              description: "Proactive hunts for novel TTPs across estate.",
            },
            {
              name: "Network Analysis & Inventory",
              description: "Topology, dependency, and exposure mapping.",
            },
            {
              name: "Phishing & Email Security",
              description: "Detects and remediates phishing and BEC.",
            },
            {
              name: "SIEM Augmentation",
              description: "Prioritizes/triages alerts with summaries and enrichment.",
            },
          ],
          kpis: ["VaR exceedances","Loss events","Surveillance alerts","Time-to-detect"],
          personas: ["Chief Risk Officer","Chief Compliance Officer","CISO"],
        },
        {
          name: "Fraud Prevention",
          useCases: [
            {
              name: "Card Transaction Fraud Prevention",
              description: "Real-time fraud scoring and interdiction.",
            },
            {
              name: "Application Fraud",
              description: "Detects first-party/third-party synthetic applications.",
            },
            {
              name: "Identity Theft",
              description: "Flags account takeover and impersonation.",
            },
          ],
          kpis: ["VaR exceedances","Loss events","Surveillance alerts","Time-to-detect"],
          personas: ["Chief Risk Officer","Chief Compliance Officer","CISO"],
        },
        {
          name: "Regulatory Compliance",
          useCases: [
            {
              name: "Transaction monitoring",
              description: "AML typologies and suspicious activity detection.",
            },
            {
              name: "Screening (KYC)",
              description: "Real-time/entity-level screening with case management.",
            },
            {
              name: "Credit Recognition (CECL)",
              description: "Lifetime loss estimation and provisioning.",
            },
            {
              name: "Model Risk Management",
              description: "Inventory, validation, monitoring and lineage.",
            },
          ],
          kpis: ["VaR exceedances","Loss events","Surveillance alerts","Time-to-detect"],
          personas: ["Chief Risk Officer","Chief Compliance Officer","CISO"],
        },
      ],
    },
    {
      name: "Be More Efficient",
      whyChange: "CFO/treasury and back/middle office automation deliver durable cost-to-income ratio improvement.",
      priorities: [
        {
          name: "CFO & Treasury",
          useCases: [
            {
              name: "Financial Projections & Reporting",
              description: "Top-down/bottom-up forecasts and close packs.",
            },
            {
              name: "Operational Dashboarding",
              description: "Cross-functional KPIs for technology and operations.",
            },
            {
              name: "Performance reporting and analysis",
              description: "GIPS/attribution and client performance packs.",
            },
            {
              name: "Expense and Cost management",
              description: "Optimize vendor, market data, and technology spend.",
            },
          ],
          kpis: ["Cost-to-income ratio","Reconciliation breaks","STP rate"],
          personas: ["Chief Operating Officer","CFO","Head of Treasury"],
        },
        {
          name: "Back- Middle office automation",
          useCases: [
            {
              name: "Intelligent Document Processing",
              description: "Automates intake, classification, and extraction from docs.",
            },
            {
              name: "Customer Onboarding (AML/KYC)",
              description: "Digital KYC with verification and risk scoring.",
            },
            {
              name: "Workforce Analytics",
              description: "Headcount, productivity, and skills insights.",
            },
          ],
          kpis: ["Cost-to-income ratio","Reconciliation breaks","STP rate"],
          personas: ["Chief Operating Officer","CFO","Head of Treasury"],
        },
      ],
    },
  ],
};
