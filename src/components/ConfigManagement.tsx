import { useState, useEffect, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import {
  getActiveConfig,
  writeConfig,
  listConfigVersions,
  diffConfigVersions,
  rollbackConfig,
  type ConfigVersionEntry,
  type ConfigReadResponse,
  type ConfigDiffResponse,
} from "../api/client";

const DOMAINS = ["instruments", "strategies", "clients", "venues"] as const;
type Domain = (typeof DOMAINS)[number];

export function ConfigManagement() {
  const [activeDomain, setActiveDomain] = useState<Domain>("instruments");
  const [activeConfig, setActiveConfig] = useState<ConfigReadResponse | null>(
    null,
  );
  const [versions, setVersions] = useState<ConfigVersionEntry[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);
  const [diffResult, setDiffResult] = useState<ConfigDiffResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edit dialog state
  const [editOpen, setEditOpen] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadDomainData = useCallback(async (domain: Domain) => {
    setLoading(true);
    setError(null);
    setDiffResult(null);
    setSelectedVersion(null);
    try {
      const [configData, versionData] = await Promise.all([
        getActiveConfig(domain),
        listConfigVersions(domain),
      ]);
      setActiveConfig(configData);
      setVersions(versionData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load config");
      setActiveConfig(null);
      setVersions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDomainData(activeDomain);
  }, [activeDomain, loadDomainData]);

  const handleDomainChange = (domain: string) => {
    setActiveDomain(domain as Domain);
  };

  const handleVersionClick = async (entry: ConfigVersionEntry) => {
    if (selectedVersion === entry.timestamp) {
      setSelectedVersion(null);
      setDiffResult(null);
      return;
    }
    if (selectedVersion !== null && selectedVersion !== entry.timestamp) {
      try {
        const diff = await diffConfigVersions(
          activeDomain,
          selectedVersion,
          entry.timestamp,
        );
        setDiffResult(diff);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to diff versions",
        );
      }
      return;
    }
    setSelectedVersion(entry.timestamp);
    setDiffResult(null);
  };

  const handleRollback = async (timestamp: string) => {
    if (!confirm(`Roll back ${activeDomain} config to version ${timestamp}?`))
      return;
    setLoading(true);
    try {
      await rollbackConfig(activeDomain, timestamp);
      await loadDomainData(activeDomain);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rollback failed");
      setLoading(false);
    }
  };

  const handleEditOpen = () => {
    setEditContent(
      activeConfig ? JSON.stringify(activeConfig.content, null, 2) : "{}",
    );
    setEditError(null);
    setEditOpen(true);
  };

  const handleEditClose = () => {
    setEditOpen(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setEditError(null);
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(editContent) as Record<string, unknown>;
    } catch {
      setEditError("Invalid JSON — please fix before saving");
      setSaving(false);
      return;
    }
    try {
      await writeConfig(activeDomain, {
        content: parsed,
        updated_by: "deployment-ui",
        schema_version: "1.0",
      });
      setEditOpen(false);
      await loadDomainData(activeDomain);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleCloseDiff = () => {
    setDiffResult(null);
    setSelectedVersion(null);
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">
          Config Store
        </h1>
        <Button
          variant="outline"
          onClick={() => void loadDomainData(activeDomain)}
          disabled={loading}
        >
          {loading ? "Loading..." : "Refresh"}
        </Button>
      </div>

      {error && (
        <div className="bg-[rgba(248,113,113,0.1)] border border-[rgba(248,113,113,0.3)] rounded p-3 text-[var(--color-accent-red)] text-sm">
          {error}
        </div>
      )}

      <Tabs value={activeDomain} onValueChange={handleDomainChange}>
        <TabsList>
          {DOMAINS.map((d) => (
            <TabsTrigger key={d} value={d} className="capitalize">
              {d}
            </TabsTrigger>
          ))}
        </TabsList>

        {DOMAINS.map((domain) => (
          <TabsContent key={domain} value={domain}>
            <div className="grid grid-cols-3 gap-4 mt-4">
              {/* Version history panel */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">
                    Version History
                  </CardTitle>
                  {selectedVersion !== null && (
                    <p className="text-xs text-[var(--color-accent-cyan)]">
                      Click another version to diff. Click same to deselect.
                    </p>
                  )}
                </CardHeader>
                <CardContent className="space-y-1 max-h-96 overflow-y-auto pt-0">
                  {versions.length === 0 && !loading && (
                    <p className="text-sm text-[var(--color-text-secondary)]">
                      No versions yet
                    </p>
                  )}
                  {loading && versions.length === 0 && (
                    <p className="text-sm text-[var(--color-text-secondary)]">
                      Loading...
                    </p>
                  )}
                  {versions.map((v, i) => (
                    <div
                      key={v.path}
                      className={`p-2 rounded border cursor-pointer text-xs space-y-1 transition-colors ${
                        selectedVersion === v.timestamp
                          ? "border-[var(--color-accent-cyan)] bg-[rgba(34,211,238,0.1)]"
                          : "border-[var(--color-border-default)] hover:bg-[var(--color-bg-hover)]"
                      }`}
                      onClick={() => void handleVersionClick(v)}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-mono text-[var(--color-text-primary)] truncate">
                          {v.timestamp}
                        </span>
                        {i === 0 && (
                          <Badge variant="success" className="text-xs shrink-0">
                            active
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className="text-xs">
                          v{v.schema_version}
                        </Badge>
                        {i > 0 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 text-xs px-1"
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleRollback(v.timestamp);
                            }}
                          >
                            Rollback
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Config viewer / diff panel */}
              <Card className="col-span-2">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium">
                      {diffResult ? "Diff View" : "Active Config"}
                    </CardTitle>
                    {diffResult ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={handleCloseDiff}
                      >
                        Close diff
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleEditOpen}
                        disabled={loading}
                      >
                        Edit
                      </Button>
                    )}
                  </div>
                  {diffResult && (
                    <p className="text-xs text-[var(--color-text-secondary)]">
                      {diffResult.timestamp_a} → {diffResult.timestamp_b}
                    </p>
                  )}
                </CardHeader>
                <CardContent className="pt-0">
                  {diffResult ? (
                    <pre className="text-xs font-mono bg-[var(--color-bg-primary)] p-3 rounded border border-[var(--color-border-default)] overflow-auto max-h-96 whitespace-pre-wrap text-[var(--color-text-primary)]">
                      {diffResult.diff.join("")}
                    </pre>
                  ) : activeConfig ? (
                    <pre className="text-xs font-mono bg-[var(--color-bg-primary)] p-3 rounded border border-[var(--color-border-default)] overflow-auto max-h-96 whitespace-pre-wrap text-[var(--color-text-primary)]">
                      {JSON.stringify(activeConfig.content, null, 2)}
                    </pre>
                  ) : loading ? (
                    <p className="text-sm text-[var(--color-text-secondary)]">
                      Loading...
                    </p>
                  ) : (
                    <p className="text-sm text-[var(--color-text-secondary)]">
                      No active config. Use Edit to create one.
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        ))}
      </Tabs>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onClose={handleEditClose}>
        <DialogHeader onClose={handleEditClose}>
          <DialogTitle>Edit {activeDomain} config</DialogTitle>
        </DialogHeader>
        <DialogContent>
          <div className="space-y-3">
            {editError && (
              <p className="text-sm text-[var(--color-accent-red)]">
                {editError}
              </p>
            )}
            <textarea
              className="w-full h-80 font-mono text-xs border border-[var(--color-border-default)] rounded p-2 resize-none bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-cyan)]"
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              placeholder="Enter JSON config..."
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={handleEditClose}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button onClick={() => void handleSave()} disabled={saving}>
                {saving ? "Saving..." : "Save & Publish"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
