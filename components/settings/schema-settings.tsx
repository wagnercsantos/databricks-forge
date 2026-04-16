"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Database } from "lucide-react";

interface SchemaSettingsProps {
  largeSchemaMode: boolean;
  onLargeSchemaModeChange: (value: boolean) => void;
}

function ToggleButton({
  enabled,
  onClick,
  activeColor = "bg-violet-500",
}: {
  enabled: boolean;
  onClick: () => void;
  activeColor?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors ${
        enabled ? `cursor-pointer ${activeColor}` : "cursor-pointer bg-muted"
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition-transform ${
          enabled ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

export function SchemaSettings({ largeSchemaMode, onLargeSchemaModeChange }: SchemaSettingsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          Schema Handling
        </CardTitle>
        <CardDescription>
          Controls how table and column metadata is budgeted for LLM prompts. These settings apply
          to both pipeline runs and standalone estate scans.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div
          className={`flex items-center justify-between rounded-lg border-2 p-4 transition-colors ${
            largeSchemaMode ? "border-violet-500/50 bg-violet-500/5" : "border-muted"
          }`}
        >
          <div className="flex items-start gap-3">
            <Database
              className={`mt-0.5 h-4 w-4 shrink-0 ${largeSchemaMode ? "text-violet-500" : "text-muted-foreground"}`}
            />
            <div>
              <p className="text-sm font-medium">Large Schema Mode</p>
              <p className="text-xs text-muted-foreground">
                {largeSchemaMode
                  ? "Enabled — aggressive column budgeting active across pipeline runs and estate scans. Prompts use intelligent column selection (max 25 per table) and capped sample data to prevent memory and token budget failures."
                  : "Disabled — standard column limits apply (40 per table). Enable for estates with wide tables (100+ columns per table)."}
              </p>
            </div>
          </div>
          <ToggleButton
            enabled={largeSchemaMode}
            onClick={() => onLargeSchemaModeChange(!largeSchemaMode)}
          />
        </div>
      </CardContent>
    </Card>
  );
}
