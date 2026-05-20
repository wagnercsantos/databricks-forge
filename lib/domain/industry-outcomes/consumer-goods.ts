/**
 * Consumer Goods -- Industry Outcome Map
 *
 * Strategic imperatives and pillars are sourced verbatim from the Master
 * Repository XLSX (Use Case Summaries sheet). Use case names and short
 * descriptions come from the same source. Rich enrichment fields (model
 * type, KPI, benchmarks, data asset linkage, MC/VA, economic patterns)
 * live in consumer-goods.enrichment.ts and are produced by the master repo seed.
 */

import type { IndustryOutcome } from "./index";

export const CONSUMER_GOODS: IndustryOutcome = {
  id: "consumer-goods",
  name: "Consumer Goods",
  subVerticals: ["Food & Beverage","Personal Care","Household Products","Apparel & Accessories","Durables"],
  suggestedDomains: ["Marketing","Sales","Supply Chain","Trade Promotion","Innovation","Workforce"],
  suggestedPriorities: ["Increase Revenue","Reduce Cost","Optimize Operations","Profitable Volume Growth"],
  objectives: [
    {
      name: "Improve Market Intelligence",
      whyChange: "Faster, deeper shopper and brand insight closes the gap between consumer signal and shelf execution.",
      priorities: [
        {
          name: "Shopper Insights",
          useCases: [
            {
              name: "Behavioral analytics",
              description: "Understand journeys and friction to grow conversion and retention.",
            },
            {
              name: "Trend monitoring",
              description: "Early detection of category, price, and seasonality shifts.",
            },
            {
              name: "Shopper insights",
              description: "Build segment, need-state, and occasion understanding to inform 4P.",
            },
            {
              name: "Customer data management",
              description: "Create governed 360° profiles for analytics/activation.",
            },
          ],
          kpis: ["Brand health score","Share of voice","Time-to-insight","Distribution velocity"],
          personas: ["Chief Marketing Officer","VP Insights","Brand Director"],
        },
        {
          name: "Brand Insights",
          useCases: [
            {
              name: "Brand Equity",
              description: "Track equity, consideration, and sentiment to guide investment.",
            },
            {
              name: "Marketing Mix",
              description: "Quantify channel ROI and optimize 4P budgets.",
            },
            {
              name: "Competitive Intelligence",
              description: "Monitor competitor price, promo, and assortment changes.",
            },
          ],
          kpis: ["Brand health score","Share of voice","Time-to-insight","Distribution velocity"],
          personas: ["Chief Marketing Officer","VP Insights","Brand Director"],
        },
        {
          name: "Retailer Logistics",
          useCases: [
            {
              name: "Collaborative performance management",
              description: "Shared scorecards with retailers/suppliers to drive JBP outcomes.",
            },
            {
              name: "RMN effectiveness",
              description: "Prove incrementality of retail media and optimize placements.",
            },
          ],
          kpis: ["Brand health score","Share of voice","Time-to-insight","Distribution velocity"],
          personas: ["Chief Marketing Officer","VP Insights","Brand Director"],
        },
      ],
    },
    {
      name: "Improve Employee Productivity",
      whyChange: "Productivity uplift across commercial, R&D, and supply chain teams compounds across portfolios and geographies.",
      priorities: [
        {
          name: "Employee Lifecycle",
          useCases: [
            {
              name: "Candidate Screening",
              description: "Prioritize applicants while controlling bias and compliance.",
            },
            {
              name: "Workforce Scheduling & Onboarding",
              description: "Optimize labor to demand; automate onboarding tasks.",
            },
            {
              name: "Employee Self Service HR",
              description: "Employee-facing assistants for leave, benefits, pay, and policy Q&A.",
            },
            {
              name: "Employee Lifecycle",
              description: "Attrition, performance, and mobility analytics.",
            },
          ],
          kpis: ["Cycle time","Capacity per FTE","Voluntary turnover"],
          personas: ["Chief People Officer","VP Operations"],
        },
        {
          name: "Employee Productivity",
          useCases: [
            {
              name: "Onboarding & knowledge management",
              description: "Speed time-to-productivity with tailored learning and SOP retrieval.",
            },
            {
              name: "Internal knowledge agents",
              description: "Tool-using agents that fetch data, draft docs, and execute tasks.",
            },
            {
              name: "AI-driven BI",
              description: "Natural-language BI, auto-insights, and anomaly detection.",
            },
            {
              name: "IT augmentation/automation",
              description: "Automate IT ops, ticket triage, data pipelines, and testing.",
            },
          ],
          kpis: ["Cycle time","Capacity per FTE","Voluntary turnover"],
          personas: ["Chief People Officer","VP Operations"],
        },
      ],
    },
    {
      name: "Build Supply Chain Resiliency",
      whyChange: "Demand volatility and supplier disruption protection are the foundation of margin defense in CPG.",
      priorities: [
        {
          name: "Supply Chain Risk Management",
          useCases: [
            {
              name: "Supplier Risk monitoring",
              description: "Multi-tier risk scoring and early-warning alerts.",
            },
            {
              name: "Logistics & Transport Risk",
              description: "Predict delays, spoilage, and lane disruptions; mitigate proactively.",
            },
            {
              name: "Network simulation",
              description: "Digital twin for supply planning, capacity and policy testing.",
            },
            {
              name: "Regulatory compliance",
              description: "Demonstrate lawful basis, lineage, DSR fulfillment, and retention.",
            },
          ],
          kpis: ["Forecast accuracy","OTIF (on-time-in-full)","Service level","Working capital days"],
          personas: ["Chief Supply Chain Officer","VP Procurement","Head of S&OP"],
        },
        {
          name: "Demand & Inventory Optimizationi",
          useCases: [
            {
              name: "Demand forecasting & planning",
              description: "Improve forecast accuracy and consensus planning.",
            },
            {
              name: "Inventory control & optimization",
              description: "Set targets, safety stock, and replenishment to cut OOS/DOH.",
            },
            {
              name: "SAP Collaboration",
              description: "Integrate ERP signals with analytics and workflows.",
            },
          ],
          kpis: ["Forecast accuracy","OTIF (on-time-in-full)","Service level","Working capital days"],
          personas: ["Chief Supply Chain Officer","VP Procurement","Head of S&OP"],
        },
        {
          name: "Retailer Collaboration",
          useCases: [
            {
              name: "Supplier data sharing & collaboration",
              description: "Share forecasts, quality, and performance securely with suppliers.",
            },
            {
              name: "Data sharing & monetization",
              description: "Package privacy-safe insights/products for partners.",
            },
            {
              name: "Elevate Data Sharing Alliance",
              description: "Establish cross-company clean-room alliance standards and ops.",
            },
          ],
          kpis: ["Forecast accuracy","OTIF (on-time-in-full)","Service level","Working capital days"],
          personas: ["Chief Supply Chain Officer","VP Procurement","Head of S&OP"],
        },
      ],
    },
    {
      name: "Profitable Volume Growth",
      whyChange: "Disciplined pricing, promotion, and portfolio innovation unlock profitable share growth.",
      priorities: [
        {
          name: "Dynamic Pricing & Promotion",
          useCases: [
            {
              name: "Price analytics",
              description: "Measure elasticity, thresholds, and competitive response.",
            },
            {
              name: "Promotion optimization",
              description: "Plan mechanics/depth/timing to maximize lift and profit.",
            },
          ],
          kpis: ["Net revenue management uplift","Promotion ROI","New product success rate"],
          personas: ["Chief Revenue Officer","VP Trade Marketing","Head of Innovation"],
        },
        {
          name: "Portfolio Optimization & Innovation",
          useCases: [
            {
              name: "SKU rationalization",
              description: "Prune low-value SKUs while protecting revenue and shelf.",
            },
            {
              name: "Price pack architecture",
              description: "Optimize size/pack/price ladders for margin and reach.",
            },
            {
              name: "Assortment optimization",
              description: "Tailor range by banner, store cluster, and mission.",
            },
          ],
          kpis: ["Net revenue management uplift","Promotion ROI","New product success rate"],
          personas: ["Chief Revenue Officer","VP Trade Marketing","Head of Innovation"],
        },
      ],
    },
  ],
};
