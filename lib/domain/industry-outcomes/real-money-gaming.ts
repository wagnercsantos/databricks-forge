/**
 * Real Money Gaming (Digital) -- Industry Outcome Map
 *
 * Strategic imperatives and pillars are sourced verbatim from the Master
 * Repository XLSX (Use Case Summaries sheet). Use case names and short
 * descriptions come from the same source. Rich enrichment fields (model
 * type, KPI, benchmarks, data asset linkage, MC/VA, economic patterns)
 * live in real-money-gaming.enrichment.ts and are produced by the master repo seed.
 */

import type { IndustryOutcome } from "./index";

export const REAL_MONEY_GAMING: IndustryOutcome = {
  id: "real-money-gaming",
  name: "Real Money Gaming (Digital)",
  subVerticals: ["Online Sportsbook","iGaming Casino","DFS","Poker"],
  suggestedDomains: ["Bettor Experience","Trading & Pricing","Compliance","Marketing","Player Protection"],
  suggestedPriorities: ["Acquire & Retain Bettors","Build the Bet","Comply & Protect"],
  objectives: [
    {
      name: "Bettor Centric Experience",
      whyChange: "Knowing, attracting, and protecting the bettor unlocks digital LTV while meeting responsible gaming obligations.",
      priorities: [
        {
          name: "Know the Bettor",
          useCases: [
            {
              name: "Bettor360",
              description: "Unified, queryable 360° view for service, trading, and marketing.",
            },
            {
              name: "Segmentation",
              description: "Create actionable player cohorts for lifecycle programs.",
            },
            {
              name: "Greater Fan Experience",
              description: "Tailor UX/content, simplify decisions, reduce friction.",
            },
            {
              name: "Journey Analytics",
              description: "Map journeys and drop-offs to optimize funnels.",
            },
            {
              name: "Identity Resolution",
              description: "Resolve cross-device/person IDs with privacy controls.",
            },
            {
              name: "Single Wallet",
              description: "Provide a unified, compliant wallet across products.",
            },
            {
              name: "Early VIP Identification",
              description: "Find high-potential bettors quickly.",
            },
          ],
          kpis: ["Active bettors","Bettor LTV","Retention cohort decay"],
          personas: ["Chief Marketing Officer","VP Retention","VP Player Protection"],
        },
        {
          name: "Attract Bettors",
          useCases: [
            {
              name: "Next Best Bet",
              description: "Contextual recommendations of markets/legs based on player context and live slate.",
            },
            {
              name: "(Re)Marketing",
              description: "Orchestrate retention/reactivation and upsell journeys.",
            },
            {
              name: "Cohort Analysis",
              description: "Measure cohorts (by join date, product, promo) over time.",
            },
            {
              name: "Pre-VIP Engagement",
              description: "Identify rising value and trigger host outreach early.",
            },
            {
              name: "Promotions",
              description: "Optimize promo targeting, caps, and ROI.",
            },
            {
              name: "Personalization",
              description: "Dynamic content/markets/UX by context.",
            },
            {
              name: "Loyalty Programs",
              description: "Tier rules, accrual/redemption optimization.",
            },
          ],
          kpis: ["Active bettors","Bettor LTV","Retention cohort decay"],
          personas: ["Chief Marketing Officer","VP Retention","VP Player Protection"],
        },
        {
          name: "Protect the Bettor",
          useCases: [
            {
              name: "Responsible Gaming",
              description: "Detect markers of harm and trigger interventions/limits.",
            },
            {
              name: "Detect Fraud During Bet",
              description: "Stop account/device abuse and arb during bet placement.",
            },
            {
              name: "Detect Fraud At Withdrawal",
              description: "Catch mule accounts, bonus abuse, AML before payout.",
            },
            {
              name: "Toxicity Mitigation",
              description: "Classify and act on abusive chat/voice/text.",
            },
            {
              name: "Churn Prediction",
              description: "Predict lapse risk and trigger save plays.",
            },
          ],
          kpis: ["Active bettors","Bettor LTV","Retention cohort decay"],
          personas: ["Chief Marketing Officer","VP Retention","VP Player Protection"],
        },
      ],
    },
    {
      name: "Betting",
      whyChange: "Build-the-bet, dynamic pricing, and personalized offers drive handle and gross gaming revenue.",
      priorities: [
        {
          name: "Build Bets",
          useCases: [
            {
              name: "Bet Lines Optimization",
              description: "Optimize pricing/limits to balance hold vs. handle.",
            },
            {
              name: "Information Summarization",
              description: "Summarize stats, rules, promos into bite-size explainers.",
            },
            {
              name: "Risk Profiling",
              description: "Assess player/market risk to set limits and monitoring.",
            },
            {
              name: "Rated Play",
              description: "Compute ADT/TTD/handle-per-hour equivalents digitally.",
            },
            {
              name: "Game Data",
              description: "Curate complete, reliable game/event data for products.",
            },
            {
              name: "Optimize Hold and Yield",
              description: "Balance promos, pricing, and limits to target hold.",
            },
          ],
          kpis: ["Handle","Gross gaming revenue","In-play bet share","Hold %"],
          personas: ["Head of Trading","VP Sportsbook Product","Head of Pricing"],
        },
        {
          name: "Offers",
          useCases: [
            {
              name: "Real Time In Game Lines",
              description: "Streamed pricing based on live state.",
            },
            {
              name: "Bet Carousels",
              description: "Rank/order markets on home/league pages.",
            },
            {
              name: "Suggested Promotions",
              description: "Next-best-offer for engagement and margin.",
            },
            {
              name: "Informed Bets",
              description: "Provide context (injuries, form) and explain lines.",
            },
            {
              name: "Understanding Lines",
              description: "Explain pricing/hold/vig to users simply.",
            },
            {
              name: "Parlay Optimization",
              description: "Construct/prioritize parlay offers to maximize margin and UX.",
            },
          ],
          kpis: ["Handle","Gross gaming revenue","In-play bet share","Hold %"],
          personas: ["Head of Trading","VP Sportsbook Product","Head of Pricing"],
        },
      ],
    },
    {
      name: "Operations",
      whyChange: "Compliance, fraud prevention, and operational optimization protect license and margin in regulated markets.",
      priorities: [
        {
          name: "Compliance",
          useCases: [
            {
              name: "Data and PII Governance",
              description: "Classify/tag PII, enforce policies and subject rights.",
            },
            {
              name: "Financial Reporting",
              description: "Auditable gaming P&L, tax, and regulatory reports.",
            },
            {
              name: "Fraud Reporting",
              description: "Generate SARs/CTR and case packages.",
            },
            {
              name: "Cyber Security DASL/Behavior",
              description: "Detect anomalous access and risky behaviors via security data lake.",
            },
            {
              name: "DSPM Integration",
              description: "Classify sensitive data, monitor posture, auto-remediate.",
            },
            {
              name: "Banned Players",
              description: "Enforce bans/self-exclusions across systems.",
            },
          ],
          kpis: ["Fraud loss bps","AML alert turnaround","Self-exclusion violations"],
          personas: ["Chief Compliance Officer","Head of Fraud","VP Operations"],
        },
        {
          name: "Optimization",
          useCases: [
            {
              name: "Internal Data Sharing",
              description: "Governed sharing across teams/domains.",
            },
            {
              name: "AI Powered Analytics",
              description: "Natural-language analytics on KPIs, content, and journeys.",
            },
            {
              name: "Data Discovery",
              description: "Search/catalog datasets, owners, and definitions.",
            },
            {
              name: "External Data Sharing",
              description: "Privacy-safe partner measurement/activation.",
            },
            {
              name: "Empower Your Team",
              description: "Copilots for ops/trading/CS with governed data access.",
            },
            {
              name: "Staff Optimization",
              description: "Forecast/optimize CS, trading, and VIP staffing.",
            },
            {
              name: "Procurement Analysis",
              description: "Optimize vendor spend/renewals and SLA risk.",
            },
          ],
          kpis: ["Fraud loss bps","AML alert turnaround","Self-exclusion violations"],
          personas: ["Chief Compliance Officer","Head of Fraud","VP Operations"],
        },
      ],
    },
  ],
};
