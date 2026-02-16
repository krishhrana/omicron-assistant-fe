"use client";

import Image from "next/image";
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AppRow } from "@/components/apps/AppRow";
import { APPS, YOUR_APPS, type AppDefinition } from "@/components/apps/app-data";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { OmicronBackdrop } from "@/components/layout/OmicronBackdrop";
import { useAuth } from "@/components/auth/AuthenticatedApp";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const CONNECTABLE_APPS: Record<
  string,
  { startUrl: string; pendingKey: string }
> = {
  gmail: {
    startUrl: "http://localhost:8000/v1/oauth/gmail/start",
    pendingKey: "omicron.pendingGmailConnect",
  },
  "google-drive": {
    startUrl: "http://localhost:8000/v1/oauth/google-drive/start",
    pendingKey: "omicron.pendingGoogleDriveConnect",
  },
};

export default function AppsPage() {
  const { session } = useAuth();
  const accessToken = session?.access_token ?? null;
  const [activeTab, setActiveTab] = useState("your-apps");
  const [selectedApp, setSelectedApp] = useState<AppDefinition | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const isDialogOpen = Boolean(selectedApp);
  const connectConfig = selectedApp
    ? CONNECTABLE_APPS[selectedApp.slug]
    : undefined;
  const isConnectable = Boolean(connectConfig);

  const handleConnect = async () => {
    if (!selectedApp) return;
    if (!connectConfig) {
      setConnectError("Connect flow is coming soon for this app.");
      return;
    }
    if (!accessToken) {
      setConnectError("Missing access token. Please sign in again.");
      return;
    }

    setIsConnecting(true);
    setConnectError(null);

    try {
      const response = await fetch(connectConfig.startUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        redirect: "manual",
        credentials: "include",
      });

      const redirectTo = (url?: string | null) => {
        if (!url) return false;
        localStorage.setItem(connectConfig.pendingKey, "true");
        window.location.href = url;
        return true;
      };

      let data: Record<string, unknown> | null = null;
      try {
        data = (await response.json()) as Record<string, unknown>;
      } catch {
        const text = await response.text();
        if (redirectTo(text.match(/https?:\/\/[^\s"]+/)?.[0])) return;
      }

      const redirectUrl =
        (data?.authorization_url as string | undefined) ??
        (data?.authorizationUrl as string | undefined) ??
        (data?.authUrl as string | undefined) ??
        (data?.redirectUrl as string | undefined) ??
        (data?.url as string | undefined) ??
        (data?.location as string | undefined);

      if (redirectTo(redirectUrl)) return;

      throw new Error(`Unable to start ${selectedApp.name} connection.`);
    } catch (err) {
      setConnectError(
        err instanceof Error
          ? err.message
          : `Unable to start ${selectedApp.name} connection.`
      );
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <OmicronBackdrop>
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-6">
        <Card className="flex flex-1 flex-col gap-0 rounded-3xl border-white/60 bg-white/80 py-0 shadow-[0_30px_80px_rgba(15,23,42,0.12)] backdrop-blur">
          <CardContent className="flex flex-1 flex-col gap-8 p-6">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.4em] text-slate-400">
                  Apps
                </p>
                <h1 className="mt-3 text-3xl font-semibold sm:text-4xl font-[var(--font-display)]">
                  Connect your tools
                </h1>
                <p className="mt-3 max-w-2xl text-sm text-slate-500">
                  Bring the apps your team already uses into Omicron. Connect once
                  and unlock summaries, automation, and faster responses everywhere.
                </p>
              </div>
              <Button className="h-10 rounded-full px-6 text-sm font-semibold">
                Request a new app
              </Button>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList
                variant="line"
                className="w-fit rounded-full border border-slate-200 bg-white/90 p-1 shadow-sm"
              >
                <TabsTrigger
                  value="your-apps"
                  className="rounded-full px-5 py-2 text-sm font-semibold text-slate-500 data-[state=active]:bg-slate-900 data-[state=active]:text-white"
                >
                  Your Apps
                </TabsTrigger>
                <TabsTrigger
                  value="all-apps"
                  className="rounded-full px-5 py-2 text-sm font-semibold text-slate-500 data-[state=active]:bg-slate-900 data-[state=active]:text-white"
                >
                  All Apps
                </TabsTrigger>
              </TabsList>

              <TabsContent value="your-apps" className="mt-6">
                {YOUR_APPS.length === 0 ? (
                  <Card className="gap-0 rounded-3xl border-slate-200/70 bg-white/90 py-0 text-center shadow-sm">
                    <CardContent className="p-10">
                      <p className="text-sm text-slate-600">Placeholder</p>
                      <Button
                        className="mt-4 rounded-full px-6 text-sm font-semibold"
                        onClick={() => setActiveTab("all-apps")}
                      >
                        Browse all apps
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-4 lg:grid-cols-2">
                    {YOUR_APPS.map((app) => (
                      <AppRow
                        key={app.slug}
                        app={app}
                        onSelect={(nextApp) => {
                          setSelectedApp(nextApp);
                          setConnectError(null);
                        }}
                      />
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="all-apps" className="mt-6">
                <div className="grid gap-4 lg:grid-cols-2">
                  {APPS.map((app) => (
                    <AppRow
                      key={app.slug}
                      app={app}
                      onSelect={(nextApp) => {
                        setSelectedApp(nextApp);
                        setConnectError(null);
                      }}
                    />
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <Dialog
          open={isDialogOpen}
          onOpenChange={(open) => {
            if (!open) {
              setSelectedApp(null);
              setConnectError(null);
              setIsConnecting(false);
            }
          }}
        >
          <DialogContent className="max-w-lg rounded-3xl border border-white/60 bg-white/95 p-6 shadow-[0_30px_80px_rgba(15,23,42,0.15)]">
            {selectedApp ? (
              <div className="flex flex-col gap-6">
                <DialogHeader className="gap-3">
                  <div className="flex items-center gap-4">
                    <span
                      className="flex h-14 w-14 items-center justify-center rounded-full border border-slate-200 bg-white shadow-sm"
                      style={{ backgroundColor: selectedApp.logoBg }}
                    >
                      <Image
                        src={selectedApp.logo}
                        alt={`${selectedApp.name} logo`}
                        width={32}
                        height={32}
                        className="h-8 w-8 object-contain"
                      />
                    </span>
                    <div>
                      <DialogTitle className="text-2xl font-semibold text-slate-900">
                        {selectedApp.name}
                      </DialogTitle>
                      <DialogDescription className="text-sm text-slate-500">
                        {selectedApp.description}
                      </DialogDescription>
                    </div>
                  </div>
                </DialogHeader>

                <p className="text-sm text-slate-600">
                  {selectedApp.longDescription}
                </p>

                <DialogFooter className="sm:justify-between">
                  <span className="text-xs text-slate-400">
                    Setup time: 2-3 minutes
                  </span>
                  <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center">
                    {connectError ? (
                      <Alert variant="destructive" className="w-full rounded-xl px-3 py-2 sm:w-auto">
                        <AlertDescription className="text-xs">
                          {connectError}
                        </AlertDescription>
                      </Alert>
                    ) : null}
                    <Button
                      className="rounded-full px-6 text-sm font-semibold"
                      onClick={handleConnect}
                      disabled={isConnecting || !isConnectable}
                    >
                      {isConnectable
                        ? isConnecting
                          ? "Connecting..."
                          : "Connect"
                        : "Coming soon"}
                    </Button>
                  </div>
                </DialogFooter>
              </div>
            ) : null}
          </DialogContent>
        </Dialog>
      </div>
    </OmicronBackdrop>
  );
}
