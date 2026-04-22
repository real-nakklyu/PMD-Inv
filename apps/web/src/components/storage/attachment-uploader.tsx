"use client";

import { FileUp, ImagePlus, Loader2, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { attachmentBucket, makeAttachmentPath, type AttachmentScope } from "@/lib/storage-path";
import { createSupabaseBrowserClient, hasSupabaseBrowserEnv } from "@/lib/supabase";

type Attachment = {
  name: string;
  path: string;
  url: string | null;
};

export function AttachmentUploader({
  scope,
  ownerId,
  label = "Attachments",
  accept = "image/*,.pdf,.doc,.docx"
}: {
  scope: AttachmentScope;
  ownerId: string;
  label?: string;
  accept?: string;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const prefix = useMemo(() => `${scope}/${ownerId}`, [scope, ownerId]);

  async function loadAttachments() {
    if (!hasSupabaseBrowserEnv() || !ownerId) return;
    setIsLoading(true);
    setMessage(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.storage.from(attachmentBucket).list(prefix, {
        limit: 30,
        sortBy: { column: "created_at", order: "desc" }
      });
      if (error) throw error;

      const signed = await Promise.all((data ?? []).map(async (item) => {
        const path = `${prefix}/${item.name}`;
        const { data: signedData } = await supabase.storage.from(attachmentBucket).createSignedUrl(path, 60 * 60);
        return { name: item.name, path, url: signedData?.signedUrl ?? null };
      }));
      setAttachments(signed);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load attachments.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    // Loading existing storage objects is an external-system sync for this owner.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAttachments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefix]);

  async function upload() {
    if (!file) {
      setMessage("Choose a file first.");
      return;
    }
    if (!hasSupabaseBrowserEnv()) {
      setMessage("Supabase browser environment variables are required for uploads.");
      return;
    }

    setIsLoading(true);
    setMessage(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const path = makeAttachmentPath(scope, ownerId, file.name);
      const { error } = await supabase.storage.from(attachmentBucket).upload(path, file, {
        cacheControl: "3600",
        upsert: false
      });
      if (error) throw error;
      setFile(null);
      setMessage("Uploaded.");
      await loadAttachments();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Card className="bg-muted/20 shadow-none">
      <CardContent className="space-y-3 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            {scope === "equipment-damage" ? <ImagePlus className="h-4 w-4" /> : <FileUp className="h-4 w-4" />}
            {label}
          </div>
          <Button type="button" className="bg-secondary text-secondary-foreground hover:bg-secondary/80" onClick={loadAttachments} disabled={isLoading}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </Button>
        </div>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <Input type="file" accept={accept} onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
          <Button type="button" onClick={upload} disabled={isLoading || !file}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
            Upload
          </Button>
        </div>
        {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
        <div className="space-y-2">
          {attachments.length ? attachments.map((item) => (
            <div key={item.path} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm">
              <span className="truncate">{item.name}</span>
              {item.url ? (
                <a className="text-xs font-medium text-primary hover:underline" href={item.url} target="_blank" rel="noreferrer">
                  Open
                </a>
              ) : <Badge>Stored</Badge>}
            </div>
          )) : <p className="text-xs text-muted-foreground">No files uploaded yet.</p>}
        </div>
      </CardContent>
    </Card>
  );
}
