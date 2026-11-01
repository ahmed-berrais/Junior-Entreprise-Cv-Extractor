"use client";
// S2-06 · "Delete" with a confirmation dialog. Calls DELETE /api/admin/profiles/:userId, then
// reloads the list. Nothing is deleted until the admin confirms in the dialog.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

export function DeleteProfileButton({ userId, who }: { userId: string; who: string }) {
  const t = useTranslations("admin.candidates");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function remove() {
    startTransition(async () => {
      const res = await fetch(`/api/admin/profiles/${userId}`, { method: "DELETE" }).catch(() => null);
      if (res?.ok) {
        setOpen(false);
        toast.success(t("deleted"));
        router.refresh();
      } else {
        toast.error(t("deleteFailed"));
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="destructive" size="sm" />}>
        <Trash2Icon data-icon="inline-start" />
        {t("delete")}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("deleteTitle")}</DialogTitle>
          <DialogDescription>{t("deleteText", { who })}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" disabled={pending} />}>{t("cancel")}</DialogClose>
          <Button variant="destructive" onClick={remove} disabled={pending}>
            {t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
