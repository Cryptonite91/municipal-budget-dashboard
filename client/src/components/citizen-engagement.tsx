/**
 * CitizenEngagement — comment form + email subscribe panel.
 * Rendered at the bottom of all citizen-facing pages.
 */
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useTenantSlug } from "@/hooks/use-tenant";
import { API_BASE } from "@/lib/api-base";
import { usePublicComments } from "@/hooks/use-budget-data";
import { useQueryClient } from "@tanstack/react-query";
import { tKey } from "@/hooks/use-budget-data";
import {
  MessageSquare,
  Mail,
  CheckCircle2,
  User,
  Clock,
  Send,
  Bell,
} from "lucide-react";

interface CitizenEngagementProps {
  section: string; // e.g. "revenue", "spending", "projects", "overview"
}

export function CitizenEngagement({ section }: CitizenEngagementProps) {
  const { toast } = useToast();
  const slug = useTenantSlug();
  const queryClient = useQueryClient();
  const { data: comments = [] } = usePublicComments();

  // Filter comments for this section
  const sectionComments = comments.filter((c) => c.section === section);

  // Comment form state
  const [commentName, setCommentName] = useState("");
  const [commentEmail, setCommentEmail] = useState("");
  const [commentMessage, setCommentMessage] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [commentDone, setCommentDone] = useState(false);

  // Subscribe form state
  const [subEmail, setSubEmail] = useState("");
  const [subSubmitting, setSubSubmitting] = useState(false);
  const [subDone, setSubDone] = useState(false);

  async function submitComment(e: React.FormEvent) {
    e.preventDefault();
    if (!commentMessage.trim()) return;
    setCommentSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/comments?tenant=${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section,
          name: commentName || undefined,
          email: commentEmail || undefined,
          message: commentMessage.trim(),
        }),
      });
      if (!res.ok) throw new Error("Failed");
      setCommentDone(true);
      setCommentName("");
      setCommentEmail("");
      setCommentMessage("");
      // Invalidate comments so new approved ones refresh
      queryClient.invalidateQueries({ queryKey: tKey("/api/comments", slug) });
      toast({
        title: "Comment submitted",
        description: "Your comment is pending review and will appear once approved.",
      });
    } catch {
      toast({ title: "Error", description: "Could not submit comment. Please try again.", variant: "destructive" });
    } finally {
      setCommentSubmitting(false);
    }
  }

  async function submitSubscribe(e: React.FormEvent) {
    e.preventDefault();
    if (!subEmail.trim()) return;
    setSubSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/subscribe?tenant=${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: subEmail.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed");
      }
      setSubDone(true);
      setSubEmail("");
      toast({ title: "Subscribed!", description: "You'll receive budget updates by email." });
    } catch (err: any) {
      const msg = err?.message || "Could not subscribe. Please try again.";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setSubSubmitting(false);
    }
  }

  return (
    <div className="mt-10 space-y-6" data-testid="citizen-engagement">
      <Separator />
      <div className="grid gap-6 md:grid-cols-2">
        {/* ── Comment Form ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquare className="h-4 w-4 text-primary" />
              Share Your Feedback
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Have a question or comment about this data? Let your municipality know.
            </p>
          </CardHeader>
          <CardContent>
            {commentDone ? (
              <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
                <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                <p className="text-sm font-medium">Thank you!</p>
                <p className="text-xs text-muted-foreground">
                  Your comment will appear after review.
                </p>
                <Button variant="ghost" size="sm" onClick={() => setCommentDone(false)} className="mt-1">
                  Leave another comment
                </Button>
              </div>
            ) : (
              <form onSubmit={submitComment} className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Name (optional)</label>
                    <div className="relative">
                      <User className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground/50" />
                      <Input
                        placeholder="Your name"
                        value={commentName}
                        onChange={(e) => setCommentName(e.target.value)}
                        className="pl-8 h-9 text-sm"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Email (optional)</label>
                    <div className="relative">
                      <Mail className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground/50" />
                      <Input
                        type="email"
                        placeholder="your@email.com"
                        value={commentEmail}
                        onChange={(e) => setCommentEmail(e.target.value)}
                        className="pl-8 h-9 text-sm"
                      />
                    </div>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Comment <span className="text-destructive">*</span></label>
                  <Textarea
                    placeholder="Your thoughts, questions, or concerns about this budget data…"
                    value={commentMessage}
                    onChange={(e) => setCommentMessage(e.target.value)}
                    required
                    rows={3}
                    className="text-sm resize-none"
                  />
                </div>
                <Button type="submit" disabled={commentSubmitting || !commentMessage.trim()} className="w-full" size="sm">
                  <Send className="h-3.5 w-3.5 mr-1.5" />
                  {commentSubmitting ? "Submitting…" : "Submit Comment"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        {/* ── Email Subscribe ── */}
        <Card className="bg-primary/5 border-primary/20">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Bell className="h-4 w-4 text-primary" />
              Stay Informed
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Get notified when your municipality publishes budget updates, new capital project milestones, or annual reports.
            </p>
          </CardHeader>
          <CardContent>
            {subDone ? (
              <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
                <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                <p className="text-sm font-medium">You're subscribed!</p>
                <p className="text-xs text-muted-foreground">
                  We'll notify you when new budget data is available.
                </p>
              </div>
            ) : (
              <form onSubmit={submitSubscribe} className="space-y-3 mt-1">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Email address</label>
                  <div className="relative">
                    <Mail className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground/50" />
                    <Input
                      type="email"
                      placeholder="your@email.com"
                      value={subEmail}
                      onChange={(e) => setSubEmail(e.target.value)}
                      required
                      className="pl-8 h-9 text-sm"
                    />
                  </div>
                </div>
                <Button type="submit" disabled={subSubmitting || !subEmail.trim()} className="w-full" size="sm" variant="outline">
                  <Bell className="h-3.5 w-3.5 mr-1.5" />
                  {subSubmitting ? "Subscribing…" : "Subscribe for Updates"}
                </Button>
                <p className="text-xs text-muted-foreground/60 text-center">
                  No spam. Unsubscribe anytime.
                </p>
              </form>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Approved Comments ── */}
      {sectionComments.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-medium">Community Comments</h3>
            <Badge variant="secondary" className="text-xs">{sectionComments.length}</Badge>
          </div>
          <div className="space-y-3">
            {sectionComments.map((comment) => (
              <Card key={comment.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <User className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <span className="text-sm font-medium">
                      {comment.name || "Anonymous Resident"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                    <Clock className="h-3 w-3" />
                    {new Date(comment.submittedAt).toLocaleDateString()}
                  </div>
                </div>
                <p className="mt-2 text-sm text-muted-foreground pl-9">{comment.message}</p>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
