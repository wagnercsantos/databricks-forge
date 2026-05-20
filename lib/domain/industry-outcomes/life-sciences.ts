/**
 * Life Sciences -- Industry Outcome Map
 *
 * Strategic imperatives and pillars are sourced verbatim from the Master
 * Repository XLSX (Use Case Summaries sheet). Use case names and short
 * descriptions come from the same source. Rich enrichment fields (model
 * type, KPI, benchmarks, data asset linkage, MC/VA, economic patterns)
 * live in life-sciences.enrichment.ts and are produced by the master repo seed.
 */

import type { IndustryOutcome } from "./index";

export const LIFE_SCIENCES: IndustryOutcome = {
  id: "life-sciences",
  name: "Life Sciences",
  subVerticals: ["Pharma","Biotech","Medical Devices","Diagnostics","CRO/CMO"],
  suggestedDomains: ["R&D","Clinical Development","Manufacturing","Supply Chain","Commercial","Patient Engagement","Regulatory"],
  suggestedPriorities: ["Accelerate R&D","Improve Commercial Effectiveness","Optimize Production","Regulatory Compliance"],
  objectives: [
    {
      name: "Increase R&D Productivity",
      whyChange: "The cost and time of bringing a therapy to market continue to rise; AI-driven discovery, FAIR data, and faster clinical development shift the curve.",
      priorities: [
        {
          name: "Accelerate Drug Discovery",
          useCases: [
            {
              name: "Genetic Target Identification",
              description: "Prioritize disease-relevant targets by integrating multi-omics and pathway evidence.",
            },
            {
              name: "QSAR Modeling (Quantitative Structure Activity Relationship)",
              description: "Predict activity/toxicity from molecular structure.",
            },
            {
              name: "Geneformer Modeling (Gene Expressions & Network Biology)",
              description: "Use transformer models on expression matrices to learn cell-state embeddings and perturbation effects.",
            },
            {
              name: "Image Classification (eg. Digital Path.)",
              description: "Classify pathology slides for diagnosis or biomarker scoring.",
            },
            {
              name: "Chromatography Insights",
              description: "Detect peak issues, drift, and optimize methods.",
            },
          ],
          kpis: ["Time to candidate","Trial enrollment rate","Protocol amendments","FAIR data coverage"],
          personas: ["Chief Scientific Officer","VP Discovery","Head of Clinical Operations"],
        },
        {
          name: "Streamline Clinical Development",
          useCases: [
            {
              name: "Clinical Trial Protocol Design",
              description: "Generate/optimize protocols and eligibility with evidence.",
            },
            {
              name: "Clinical Trial Site Selection",
              description: "Rank sites/investigators by expected performance and feasibility.",
            },
            {
              name: "Drug Repurposing",
              description: "Identify new indications for existing assets via network and literature evidence.",
            },
            {
              name: "Automate QA of Clinical Data",
              description: "Detect anomalies, missingness, and protocol deviations in clinical datasets.",
            },
            {
              name: "Modernize Clinical Data Repository",
              description: "Establish scalable, standardized clinical analytics on OMOP.",
            },
          ],
          kpis: ["Time to candidate","Trial enrollment rate","Protocol amendments","FAIR data coverage"],
          personas: ["Chief Scientific Officer","VP Discovery","Head of Clinical Operations"],
        },
        {
          name: "Build a FAIR Data Platform",
          useCases: [
            {
              name: "Knowledge Graphs for R&D",
              description: "Build a unified graph linking entities across biology and chemistry.",
            },
            {
              name: "Medical Image Processing & Management (Pixels for DICOM)",
              description: "Normalize, de-identify, and manage medical images for AI/analysis.",
            },
            {
              name: "Omics Data Management",
              description: "Curate, QC, and provision multi-omics for analysis at scale.",
            },
            {
              name: "Research Assistant",
              description: "Scientist copilot that answers questions with citations.",
            },
            {
              name: "BioMedical Information Retrieval",
              description: "Domain search with semantic retrieval and filtering.",
            },
          ],
          kpis: ["Time to candidate","Trial enrollment rate","Protocol amendments","FAIR data coverage"],
          personas: ["Chief Scientific Officer","VP Discovery","Head of Clinical Operations"],
        },
      ],
    },
    {
      name: "Optimize Production",
      whyChange: "Smart manufacturing and end-to-end supply visibility protect launch readiness and product availability.",
      priorities: [
        {
          name: "Create E2E Supply Chain Visibility",
          useCases: [
            {
              name: "Automate Reporting (eg., OTIF)",
              description: "Generate operational KPI reports (e.g., on-time-in-full).",
            },
            {
              name: "Inventory Management",
              description: "Optimize stock levels and expiries.",
            },
            {
              name: "Demand Forecasting",
              description: "Forecast demand by SKU/channel/region.",
            },
            {
              name: "Distribution Optimization",
              description: "Plan shipments, routes, and allocations.",
            },
          ],
          kpis: ["Batch yield","OEE","Right-first-time","Cycle time"],
          personas: ["Chief Manufacturing Officer","VP Supply Chain","Site Director"],
        },
        {
          name: "Implement Smart Manufacturing",
          useCases: [
            {
              name: "Digital Twins",
              description: "Simulate process/equipment to test scenarios.",
            },
            {
              name: "Overall Equipment Effectiveness",
              description: "Monitor OEE and drivers (availability, performance, quality).",
            },
            {
              name: "Predictive Maintenance",
              description: "Predict failures and schedule interventions.",
            },
          ],
          kpis: ["Batch yield","OEE","Right-first-time","Cycle time"],
          personas: ["Chief Manufacturing Officer","VP Supply Chain","Site Director"],
        },
      ],
    },
    {
      name: "Improve Commercial Effectiveness",
      whyChange: "Real-world evidence, next-best-action for providers, and personalized patient engagement compound across therapy areas.",
      priorities: [
        {
          name: "Generate Real World Evidence",
          useCases: [
            {
              name: "Data Standardization with OMOP",
              description: "Map heterogeneous clinical/RWD to OMOP.",
            },
            {
              name: "Patient Cohorting & Propensity Score Matching",
              description: "Create comparable cohorts for studies.",
            },
            {
              name: "Comparative Effectiveness",
              description: "Estimate treatment effects across real-world populations.",
            },
            {
              name: "Clinical Data Abstraction",
              description: "Extract key fields from notes/records.",
            },
            {
              name: "Pharmacovigilance (Drug Safety & AE Detection)",
              description: "Detect, triage, and analyze adverse events.",
            },
          ],
          kpis: ["HCP engagement rate","Patient adherence","Speed to launch peak"],
          personas: ["Chief Commercial Officer","VP Medical Affairs","VP Patient Services"],
        },
        {
          name: "Deliver Provider Next-Best-Action",
          useCases: [
            {
              name: "Global Customer 360",
              description: "Unify HCP/HCO profiles and engagements.",
            },
            {
              name: "Brand Analytics (Provider Segmentation, Sales Forecasting)",
              description: "Segment HCPs and forecast demand.",
            },
            {
              name: "Sales Rep / Medical Science Assistant",
              description: "Copilot for call prep, objection handling, and compliant content.",
            },
            {
              name: "Next-Best-Action Recommendations / Omnichannel",
              description: "Recommend personalized next steps across channels.",
            },
          ],
          kpis: ["HCP engagement rate","Patient adherence","Speed to launch peak"],
          personas: ["Chief Commercial Officer","VP Medical Affairs","VP Patient Services"],
        },
        {
          name: "Personalized Patient Engagement",
          useCases: [
            {
              name: "Deliver Digital Health Applications (eg., CGM)",
              description: "Provide insights and interventions from device/app data.",
            },
            {
              name: "Support Patient Services (eg., Scheduling, Chatbot)",
              description: "Automate case intake, triage, and scheduling.",
            },
            {
              name: "Automate Adherence Reminders",
              description: "Trigger personalized reminders and escalation.",
            },
            {
              name: "Digital Patient 360",
              description: "Unified, longitudinal patient view for care/support.",
            },
          ],
          kpis: ["HCP engagement rate","Patient adherence","Speed to launch peak"],
          personas: ["Chief Commercial Officer","VP Medical Affairs","VP Patient Services"],
        },
      ],
    },
  ],
};
