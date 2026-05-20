/**
 * Healthcare -- Industry Outcome Map
 *
 * Strategic imperatives and pillars are sourced verbatim from the Master
 * Repository XLSX (Use Case Summaries sheet). Use case names and short
 * descriptions come from the same source. Rich enrichment fields (model
 * type, KPI, benchmarks, data asset linkage, MC/VA, economic patterns)
 * live in healthcare.enrichment.ts and are produced by the master repo seed.
 */

import type { IndustryOutcome } from "./index";

export const HEALTHCARE: IndustryOutcome = {
  id: "healthcare",
  name: "Healthcare",
  subVerticals: ["Health Systems","Payers","Physician Groups","Ambulatory & Specialty"],
  suggestedDomains: ["Clinical Operations","Revenue Cycle","Care Management","Quality & Safety","Population Health","Patient Experience"],
  suggestedPriorities: ["Improve Care Quality","Reduce Cost","Streamline Operations","Patient Engagement"],
  objectives: [
    {
      name: "Streamline Operations",
      whyChange: "Interoperability, automated clinical note review, and operational AI unlock capacity and reduce administrative burden.",
      priorities: [
        {
          name: "Implement Interoperability",
          useCases: [
            {
              name: "Automate Reporting (e.g., NEDOCS for ED Wait Times)",
              description: "Operationalize NEDOCS and ED KPIs with automated feeds and near-real-time dashboards.",
            },
            {
              name: "Predict Patient Throughput (ICU Capacity Planning)",
              description: "Forecast bed demand, LOS, and bottlenecks to optimize staffing and diversion.",
            },
            {
              name: "Automate Clinical Data Pipelines with FHIR",
              description: "Build resilient FHIR-based ingestion/validation to standardize clinical data at scale.",
            },
            {
              name: "Support DICOM (standard for medical images)",
              description: "Enable image routing, metadata extraction, and research curation from PACS/VNA.",
            },
          ],
          kpis: ["Average length of stay","Throughput","Coding accuracy","Cost-per-encounter"],
          personas: ["Chief Operating Officer","Chief Medical Information Officer","VP Revenue Cycle"],
        },
        {
          name: "Automate Clinical Note Review",
          useCases: [
            {
              name: "Reimbursement: Coding & Approvals",
              description: "Accelerate accurate coding and coverage decisions from clinical evidence.",
            },
            {
              name: "Medicare Risk Adjustment",
              description: "Improve HCC capture and recapture to align revenue with risk.",
            },
            {
              name: "De-Identify Unstructured Data",
              description: "Remove PHI from notes/transcripts/images for research and sharing.",
            },
            {
              name: "AI-Assisted Data Curation (Registry & Research)",
              description: "Curate cohorts and features with AI extraction and human-in-the-loop QA.",
            },
          ],
          kpis: ["Average length of stay","Throughput","Coding accuracy","Cost-per-encounter"],
          personas: ["Chief Operating Officer","Chief Medical Information Officer","VP Revenue Cycle"],
        },
        {
          name: "Improve Operating Efficiency",
          useCases: [
            {
              name: "Automate Prior Authorization",
              description: "Pre-submit checks and auto-decisioning with explainable rule/AI support.",
            },
            {
              name: "Modernize Underwriting: Forecast Utilization & Accelerate Bids",
              description: "Predict utilization/cost by population and scenario to price bids faster.",
            },
            {
              name: "Detect Fraud, Waste, & Abuse (Payment Integrity)",
              description: "Spot anomalous billing, upcoding, and improper payments.",
            },
            {
              name: "Improve Revenue Cycle Mgmt",
              description: "Reduce denials, accelerate cash, optimize yield.",
            },
            {
              name: "Optimize Supply Chain",
              description: "Match inventory to procedure demand; prevent stock-outs/waste.",
            },
          ],
          kpis: ["Average length of stay","Throughput","Coding accuracy","Cost-per-encounter"],
          personas: ["Chief Operating Officer","Chief Medical Information Officer","VP Revenue Cycle"],
        },
      ],
    },
    {
      name: "Improve Provider Quality & Network Mgmt",
      whyChange: "Quality of care and network optimization protect outcomes, ratings, and risk-adjusted revenue.",
      priorities: [
        {
          name: "Drive Quality of Care",
          useCases: [
            {
              name: "Improve HEDIS Scores",
              description: "Close gaps in care and document compliance.",
            },
            {
              name: "Improve Star Ratings (Medicare)",
              description: "Lift CAHPS/quality metrics via targeted outreach and service recovery.",
            },
            {
              name: "Improve Nurse Handoffs for Continuity of Care",
              description: "Generate concise, structured handoff summaries with action items.",
            },
          ],
          kpis: ["Readmission rate","HEDIS / Stars scores","Network leakage"],
          personas: ["Chief Medical Officer","VP Quality","VP Network"],
        },
        {
          name: "Optimize Networks & Referrals",
          useCases: [
            {
              name: "Analyze Price Transparency for Network Rates",
              description: "Normalize machine-readable rates to compare payers/providers and steerage.",
            },
            {
              name: "Nearest Neighbor for Provider Referrals",
              description: "Match patients to optimal in-network providers by need and proximity.",
            },
          ],
          kpis: ["Readmission rate","HEDIS / Stars scores","Network leakage"],
          personas: ["Chief Medical Officer","VP Quality","VP Network"],
        },
      ],
    },
    {
      name: "Deliver Better Patient Outcomes & Experience",
      whyChange: "Predicting disease risk, personalizing engagement, and improving retention all move the needle on outcomes and financial performance.",
      priorities: [
        {
          name: "Predict Disease Risk",
          useCases: [
            {
              name: "Reduce Hospital Readmissions",
              description: "Predict 30-day risk and trigger transitional care.",
            },
            {
              name: "Predict Disease Onset & Progression",
              description: "Anticipate incidence and trajectory for targeted intervention.",
            },
            {
              name: "Identify Probability of Next Clinical Event",
              description: "Sequence-aware risk for next ED visit, admission, or escalation.",
            },
            {
              name: "Polygenic Risk Scoring",
              description: "Compute PRS and link to phenotypes for preventive care.",
            },
          ],
          kpis: ["HCAHPS / NPS","Risk-adjusted mortality","Member retention"],
          personas: ["Chief Experience Officer","VP Population Health","VP Patient Engagement"],
        },
        {
          name: "Personalize Engagement",
          useCases: [
            {
              name: "Deliver Digital Health Apps (e.g., CGM)",
              description: "Provide AI-assisted coaching and alerts tied to device data.",
            },
            {
              name: "Support Patient Services (Scheduling, Chatbot)",
              description: "Self-service scheduling, benefits, and triage via conversational interfaces.",
            },
            {
              name: "Automate Adherence Reminders",
              description: "Identify non-adherent members and trigger omni-channel nudges.",
            },
          ],
          kpis: ["HCAHPS / NPS","Risk-adjusted mortality","Member retention"],
          personas: ["Chief Experience Officer","VP Population Health","VP Patient Engagement"],
        },
        {
          name: "Improve Retention",
          useCases: [
            {
              name: "Predict Member Churn",
              description: "Anticipate disenrollment risk to guide retention actions.",
            },
            {
              name: "Call Center Analytics (Sentiment Analysis)",
              description: "Analyze conversations for intent, sentiment, and compliance.",
            },
            {
              name: "Predict Propensity to Engage with Social Determinants",
              description: "Target members likely to accept SDOH services.",
            },
          ],
          kpis: ["HCAHPS / NPS","Risk-adjusted mortality","Member retention"],
          personas: ["Chief Experience Officer","VP Population Health","VP Patient Engagement"],
        },
      ],
    },
  ],
};
