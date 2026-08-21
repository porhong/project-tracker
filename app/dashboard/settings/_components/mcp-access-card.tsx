"use client";

import { useState, useTransition } from "react";
import { CheckIcon, CopyIcon, PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MCP_TOKEN_TTL_DAYS } from "@/lib/mcp/token-constants";
import {
  createMcpAccessToken,
  revokeMcpAccessToken,
  type McpTokenRow,
} from "../actions";

const MCP_TOOL_SUMMARY = [
  { label: "Projects", detail: "7 tools" },
  { label: "Sprints", detail: "6 tools" },
  { label: "Users", detail: "6 tools" },
] as const;

function buildClientConfig(endpointUrl: string, token: string | null) {
  return JSON.stringify(
    {
      mcpServers: {
        "project-tracker": {
          url: endpointUrl,
          headers: {
            Authorization: `Bearer ${token ?? "<paste-mcp-token-here>"}`,
          },
        },
      },
    },
    null,
    2,
  );
}

async function copyText(value: string, successMessage: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(successMessage);
    return true;
  } catch {
    toast.error("Could not copy to the clipboard.");
    return false;
  }
}

function formatWhen(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function tokenStatus(token: McpTokenRow, nowMs: number) {
  if (token.revoked_at) return { label: "Revoked", variant: "secondary" as const };
  if (new Date(token.expires_at).getTime() <= nowMs) {
    return { label: "Expired", variant: "secondary" as const };
  }
  return { label: "Active", variant: "default" as const };
}

export function McpAccessCard({
  endpointUrl,
  tokens,
}: {
  endpointUrl: string;
  tokens: McpTokenRow[];
}) {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [freshToken, setFreshToken] = useState<string | null>(null);
  const [freshExpiresAt, setFreshExpiresAt] = useState<string | null>(null);
  const [copied, setCopied] = useState<"url" | "token" | "config" | null>(null);
  const [nowMs] = useState(() => Date.now());

  const markCopied = (key: "url" | "token" | "config") => {
    setCopied(key);
    window.setTimeout(
      () => setCopied((current) => (current === key ? null : current)),
      1500,
    );
  };

  const onCopyUrl = async () => {
    if (await copyText(endpointUrl, "Endpoint URL copied.")) markCopied("url");
  };

  const onCopyFreshToken = async () => {
    if (!freshToken) return;
    if (await copyText(freshToken, "MCP token copied.")) markCopied("token");
  };

  const onCopyConfig = async () => {
    const config = buildClientConfig(endpointUrl, freshToken);
    if (
      await copyText(
        config,
        freshToken ? "Client config copied." : "Config template copied — paste your token into it.",
      )
    ) {
      markCopied("config");
    }
  };

  const onCreate = () => {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("name", name.trim() || "MCP token");
      const result = await createMcpAccessToken(formData);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setFreshToken(result.token);
      setFreshExpiresAt(result.expiresAt);
      setName("");
      toast.success(`MCP token created — valid for ${MCP_TOKEN_TTL_DAYS} days.`);
    });
  };

  const onRevoke = (token: McpTokenRow) => {
    startTransition(async () => {
      const result = await revokeMcpAccessToken(token.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (freshToken?.startsWith(token.token_prefix)) {
        setFreshToken(null);
        setFreshExpiresAt(null);
      }
      toast.success("MCP token revoked.");
    });
  };

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>AI agent access (MCP)</CardTitle>
        <CardDescription>
          Issue a long-lived token ({MCP_TOKEN_TTL_DAYS} days) for Cursor, Claude
          Desktop, or another MCP client. Tokens are shown once — store them
          securely.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap gap-2">
          {MCP_TOOL_SUMMARY.map((item) => (
            <Badge key={item.label} variant="secondary">
              {item.label}
              <span className="text-muted-foreground"> · {item.detail}</span>
            </Badge>
          ))}
          <Badge variant="outline">Admin only</Badge>
          <Badge variant="outline">{MCP_TOKEN_TTL_DAYS}-day tokens</Badge>
        </div>

        <Alert>
          <AlertTitle>Bearer token required</AlertTitle>
          <AlertDescription>
            The client must send{" "}
            <span className="font-mono text-foreground">
              Authorization: Bearer &lt;ptmcp_…&gt;
            </span>
            . Treat tokens like passwords: anyone with one can run admin MCP tools
            until it expires or you revoke it. Short-lived Supabase session JWTs
            (~1 hour) still work for debugging, but prefer a dedicated MCP token
            for agents.
          </AlertDescription>
        </Alert>

        <div className="space-y-2">
          <Label htmlFor="mcp-endpoint">Endpoint URL</Label>
          <InputGroup>
            <InputGroupInput
              id="mcp-endpoint"
              readOnly
              value={endpointUrl}
              className="font-mono text-xs"
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                aria-label="Copy endpoint URL"
                size="icon-xs"
                variant="ghost"
                onClick={onCopyUrl}
              >
                {copied === "url" ? <CheckIcon /> : <CopyIcon />}
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </div>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="mcp-token-name">Create token</Label>
            <p className="text-xs text-muted-foreground">
              Optional label to remember which agent or machine uses this token.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              id="mcp-token-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
              placeholder="e.g. Cursor on laptop"
              className="sm:flex-1"
            />
            <Button type="button" disabled={pending} onClick={onCreate}>
              <PlusIcon data-icon="inline-start" />
              {pending ? "Creating…" : `Create ${MCP_TOKEN_TTL_DAYS}-day token`}
            </Button>
          </div>
        </div>

        {freshToken ? (
          <Alert>
            <AlertTitle>Copy this token now</AlertTitle>
            <AlertDescription>
              <p className="mb-3">
                It will not be shown again. Expires {formatWhen(freshExpiresAt)}.
              </p>
              <InputGroup className="h-auto min-h-8">
                <InputGroupInput
                  readOnly
                  value={freshToken}
                  className="font-mono text-xs"
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    aria-label="Copy MCP token"
                    size="icon-xs"
                    variant="ghost"
                    onClick={onCopyFreshToken}
                  >
                    {copied === "token" ? <CheckIcon /> : <CopyIcon />}
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
            </AlertDescription>
          </Alert>
        ) : null}

        <Separator />

        <div className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div className="space-y-1">
              <Label>Client configuration</Label>
              <p className="text-xs text-muted-foreground">
                Paste into Cursor MCP settings or a compatible desktop client.
                {freshToken
                  ? " Includes the token you just created."
                  : " Create a token first, or paste one into the template."}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onCopyConfig}
            >
              {copied === "config" ? (
                <CheckIcon data-icon="inline-start" />
              ) : (
                <CopyIcon data-icon="inline-start" />
              )}
              Copy config
            </Button>
          </div>
          <pre className="overflow-x-auto rounded-2xl border bg-muted/40 p-3 font-mono text-xs leading-relaxed text-foreground">
            {buildClientConfig(endpointUrl, freshToken)}
          </pre>
        </div>

        <div className="space-y-3">
          <Label>Your tokens</Label>
          <div className="rounded-2xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Prefix</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="w-0" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {tokens.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground">
                      No MCP tokens yet. Create one to connect an AI agent.
                    </TableCell>
                  </TableRow>
                ) : (
                  tokens.map((token) => {
                    const status = tokenStatus(token, nowMs);
                    const canRevoke =
                      !token.revoked_at &&
                      new Date(token.expires_at).getTime() > nowMs;
                    return (
                      <TableRow key={token.id}>
                        <TableCell className="font-medium">{token.name}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {token.token_prefix}…
                        </TableCell>
                        <TableCell>
                          <Badge variant={status.variant}>{status.label}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatWhen(token.expires_at)}
                        </TableCell>
                        <TableCell>
                          {canRevoke ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={pending}
                              onClick={() => onRevoke(token)}
                            >
                              Revoke
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
