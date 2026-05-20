/**
 * Retail -- Industry Outcome Map
 *
 * Strategic imperatives and pillars are sourced verbatim from the Master
 * Repository XLSX (Use Case Summaries sheet). Use case names and short
 * descriptions come from the same source. Rich enrichment fields (model
 * type, KPI, benchmarks, data asset linkage, MC/VA, economic patterns)
 * live in retail.enrichment.ts and are produced by the master repo seed.
 */

import type { IndustryOutcome } from "./index";

export const RETAIL: IndustryOutcome = {
  id: "retail",
  name: "Retail",
  subVerticals: ["Grocery Retail","Fashion & Apparel","Specialty Retail","E-Commerce","Multi-Brand Retail"],
  suggestedDomains: ["Customer Experience","Supply Chain","Merchandising","Store Operations","Marketing","Workforce"],
  suggestedPriorities: ["Increase Revenue","Reduce Cost","Optimize Operations","Enhance Experience"],
  objectives: [
    {
      name: "Personalize & Monetize CX",
      whyChange: "Personalized commerce drives conversion uplift across digital and store channels; retail media networks unlock incremental margin.",
      priorities: [
        {
          name: "Customer Data Management",
          useCases: [
            {
              name: "Customer Data Enrichment",
              description: "Append, infer, and normalize customer attributes to improve personalization and analytics.",
            },
            {
              name: "Identity Resolution",
              description: "Unify identifiers across devices/channels to a person/household while honoring consent.",
            },
            {
              name: "Customer Data Management",
              description: "Govern, unify, and activate first-party data with auditable controls.",
            },
          ],
          kpis: ["Conversion rate","Customer lifetime value","Retail media revenue per impression","Customer acquisition cost"],
          personas: ["Chief Customer Officer","VP Marketing","VP Retail Media"],
        },
        {
          name: "Customer Insights & Activiation",
          useCases: [
            {
              name: "Customer Insights",
              description: "Build segments, lifetime value, and journey insights across channels.",
            },
            {
              name: "Recommendation",
              description: "Serve next-best products/content across web/app/email.",
            },
            {
              name: "Activation (Content & Audience)",
              description: "Build/activate high-value audiences and creatives across paid/owned channels.",
            },
            {
              name: "Content Generation",
              description: "Generate on-brand product copy, ads and variants at scale.",
            },
            {
              name: "Promotions",
              description: "Optimize promo design, cadence, and guardrails to protect margin.",
            },
          ],
          kpis: ["Conversion rate","Customer lifetime value","Retail media revenue per impression","Customer acquisition cost"],
          personas: ["Chief Customer Officer","VP Marketing","VP Retail Media"],
        },
        {
          name: "Retail Media Networks",
          useCases: [
            {
              name: "Data sharing & clean rooms",
              description: "Collaborate with advertisers/suppliers in privacy-safe environments.",
            },
            {
              name: "Closed loop attribution",
              description: "Link media exposures to sales and incrementality across channels.",
            },
          ],
          kpis: ["Conversion rate","Customer lifetime value","Retail media revenue per impression","Customer acquisition cost"],
          personas: ["Chief Customer Officer","VP Marketing","VP Retail Media"],
        },
      ],
    },
    {
      name: "Improve Employee Productivity",
      whyChange: "Frontline and corporate productivity gains compound across thousands of stores and tens of thousands of associates.",
      priorities: [
        {
          name: "Employee Lifecycle",
          useCases: [
            {
              name: "Candidate Screening",
              description: "Screen applicants with compliant, explainable models and workflows.",
            },
            {
              name: "Workforce Scheduling & Onboarding",
              description: "Optimize staffing vs. demand and streamline onboarding steps.",
            },
            {
              name: "Employee Self Service HR",
              description: "Conversational self-service for policies, benefits, and updates.",
            },
            {
              name: "Employee Lifecycle",
              description: "Predict attrition, promotion fit, and develop career paths.",
            },
          ],
          kpis: ["Time-to-decision","Tickets per associate","Voluntary turnover"],
          personas: ["Chief People Officer","VP Store Operations"],
        },
        {
          name: "Employee Productivity",
          useCases: [
            {
              name: "Onboarding & knowledge mgmt",
              description: "Centralize SOPs and enable just-in-time guidance for new hires.",
            },
            {
              name: "Internal knowledge agents",
              description: "Agentic assistants that search, summarize, and action internal knowledge.",
            },
            {
              name: "AI-driven BI",
              description: "Natural-language BI and automated insights spanning commercial/ops.",
            },
            {
              name: "IT augmentation / automation",
              description: "AIOps for incident triage, root cause, and task automation.",
            },
          ],
          kpis: ["Time-to-decision","Tickets per associate","Voluntary turnover"],
          personas: ["Chief People Officer","VP Store Operations"],
        },
      ],
    },
    {
      name: "Build Supply Chain Resiliency",
      whyChange: "Stockouts and excess inventory destroy margin; resilient supplier networks protect revenue and ESG commitments.",
      priorities: [
        {
          name: "Supply Chain Risk Management",
          useCases: [
            {
              name: "Supplier Risk monitoring",
              description: "Monitor third-party risk (financial, ESG, geo, cyber) and alerts.",
            },
            {
              name: "Logistics & Transport Risk",
              description: "Predict ETAs, disruptions, and mitigation for middle/last mile.",
            },
            {
              name: "Network simulation",
              description: "Digital twin of stores/DCs to test layouts, flows, and fulfillment.",
            },
            {
              name: "Regulatory compliance",
              description: "Enforce GDPR/PCI and AI governance across data/AI lifecycle.",
            },
          ],
          kpis: ["Stockout rate","Inventory turn","Forecast accuracy","Supplier on-time-in-full"],
          personas: ["Chief Supply Chain Officer","VP Merchandising","VP Procurement"],
        },
        {
          name: "Demand & Inventory Optimizationi",
          useCases: [
            {
              name: "Demand forecasting & planning",
              description: "Forecast SKU-by-location demand and plan inventory/fulfillment.",
            },
            {
              name: "Inventory control & optimization",
              description: "Optimize safety stock, replenishment, and placement.",
            },
          ],
          kpis: ["Stockout rate","Inventory turn","Forecast accuracy","Supplier on-time-in-full"],
          personas: ["Chief Supply Chain Officer","VP Merchandising","VP Procurement"],
        },
        {
          name: "Supplier Collaboration",
          useCases: [
            {
              name: "Supplier data sharing & collaboration",
              description: "Share forecasts, ASN/quality, and plans securely with vendors.",
            },
            {
              name: "Data sharing & monetization",
              description: "Package first-party insights for partners/RMNs with controls.",
            },
            {
              name: "Supplier Collaborative Planning",
              description: "Joint forecasts/replenishment (CPFR) to reduce stockouts and costs.",
            },
          ],
          kpis: ["Stockout rate","Inventory turn","Forecast accuracy","Supplier on-time-in-full"],
          personas: ["Chief Supply Chain Officer","VP Merchandising","VP Procurement"],
        },
      ],
    },
  ],
};
