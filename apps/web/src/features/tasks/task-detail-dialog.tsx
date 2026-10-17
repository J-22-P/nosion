'use client';

import { prioritySchema, taskPayloadSchema, type EntryDto, type Priority } from '@nosion/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleDot, ExternalLink, GitPullRequest, Undo2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input, Label, Select } from '@/components/ui/input';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Skeleton } from '@/components/ui/skeleton';
import { Markdown } from '@/components/shared/markdown';
import { useSession } from '@/features/auth/use-session';
import { entriesApi } from '@/features/entries/api';
import { useProjects } from '@/features/entries/use-entries';
import { dateTimeFormat } from '@nosion/core/intl';
import { errorText } from '@/i18n/errors';
import { ApiError } from '@/lib/api-client';
import { DEFAULT_TIME_ZONE, priorityLabel } from '@/lib/format';
import { useUIStore } from '@/lib/stores/ui-store';
import { cachedEntry } from '@/lib/sync';
import { useLocale, useTranslations } from 'next-intl';

type DescriptionMode = 'preview' | 'write';

export const taskDetailKey = (id: string) => ['entries', 'detail', id] as const;

/** เปิดหน้าต่างรายละเอียดงาน — เรียกได้จากทุกหน้า (dialog วางไว้ที่ AppShell ตัวเดียว) */
export function openTaskDetail(id: string) {
  useUIStore.getState().openTaskDetail(id);
}

/** วันที่ (YYYY-MM-DD) ของ occurredAt ตามโซนผู้ใช้ — ค่าของ <input type="date"> */
function dateInZone(iso: string | null, timeZone: string): string {
  return iso ? dateTimeFormat('en-CA', { timeZone }).format(new Date(iso)) : '';
}

/**
 * หน้าต่างรายละเอียดงาน — ดู/แก้ชื่อ รายละเอียด วันครบกำหนด ความสำคัญ และติ๊กเสร็จ/ยกเลิกเสร็จ
 * (กันกรณีกดเสร็จผิด) · เปิดจากหน้า Tasks, Today และ Calendar ผ่าน `openTaskDetail(id)`
 */
export function TaskDetailDialog() {
  const id = useUIStore((s) => s.taskDetailId);
  const close = () => useUIStore.getState().openTaskDetail(null);
  const ref = useRef<HTMLDialogElement>(null);
  const t = useTranslations('taskDetail');

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (id && !dialog.open) dialog.showModal();
    if (!id && dialog.open) dialog.close();
  }, [id]);

  return (
    <dialog
      ref={ref}
      onClose={close}
      aria-labelledby="task-detail-title"
      className="m-auto max-h-[calc(100dvh-32px)] w-[min(640px,calc(100vw-32px))] overflow-y-auto rounded-panel border border-hairline bg-surface p-0 text-fg shadow-float backdrop:bg-black/40"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-hairline bg-surface px-5 py-4">
        <h2 id="task-detail-title" className="text-base font-semibold">
          {t('title')}
        </h2>
        <Button variant="ghost" size="icon-sm" onClick={close} aria-label={t('close')}>
          <X size={16} aria-hidden="true" />
        </Button>
      </div>
      {/* key = id → เปิดงานใหม่แล้วฟอร์มเริ่มจากค่าของงานนั้น ไม่ค้างค่าของงานก่อน */}
      {id ? <DetailBody key={id} id={id} onClose={close} /> : null}
    </dialog>
  );
}

function DetailBody({ id, onClose }: { id: string; onClose: () => void }) {
  const t = useTranslations('taskDetail');
  const query = useQuery({
    queryKey: taskDetailKey(id),
    queryFn: () => entriesApi.get(id),
    initialData: () => cachedEntry(id) ?? undefined,
    staleTime: 0,
  });

  // key = version → ได้ข้อมูลใหม่จาก server (refetch / แก้ชนแล้วโหลดใหม่) ฟอร์มเริ่มจากค่าล่าสุด
  if (query.data)
    return <DetailForm key={query.data.version} entry={query.data} onClose={onClose} />;
  if (query.isError) {
    return (
      <p role="alert" className="p-5 text-sm text-danger">
        {query.error instanceof ApiError && query.error.status === 404
          ? t('notFound')
          : t('loadFailed')}
      </p>
    );
  }
  return (
    <div className="space-y-3 p-5">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

function DetailForm({ entry, onClose }: { entry: EntryDto; onClose: () => void }) {
  const t = useTranslations('taskDetail');
  const locale = useLocale();
  const { settings } = useSession();
  const timeZone = settings?.timezone ?? DEFAULT_TIME_ZONE;
  const projects = useProjects();
  const queryClient = useQueryClient();

  const initialDate = dateInZone(entry.occurredAt, timeZone);
  const [title, setTitle] = useState(entry.title);
  const [description, setDescription] = useState(entry.description ?? '');
  const [date, setDate] = useState(initialDate);
  const [priority, setPriority] = useState<Priority>(entry.priority);
  // มีรายละเอียดอยู่แล้ว → เปิดมาเป็นหน้าแสดงผล (แบบ GitHub) · ยังว่าง → เปิดช่องเขียนเลย
  const [descriptionMode, setDescriptionMode] = useState<DescriptionMode>(
    entry.description?.trim() ? 'preview' : 'write',
  );

  const done = entry.status === 'done';
  const dirty =
    title.trim() !== entry.title ||
    description !== (entry.description ?? '') ||
    date !== initialDate ||
    priority !== entry.priority;

  const refresh = (updated: EntryDto) => {
    queryClient.setQueryData(taskDetailKey(entry.id), updated);
    void queryClient.invalidateQueries({ queryKey: ['entries'] });
  };

  const save = useMutation({
    mutationFn: () =>
      entriesApi.update(entry.id, {
        version: entry.version,
        ...(title.trim() !== entry.title ? { title: title.trim() } : {}),
        ...(description !== (entry.description ?? '')
          ? { description: description.trim() ? description : null }
          : {}),
        ...(priority !== entry.priority ? { priority } : {}),
        // วันที่ล้วน = ทั้งวัน · ล้างวันที่ = ไม่มีกำหนด (งานที่มีเวลาอยู่แล้วเปลี่ยนแค่วัน → ใช้ทั้งวันแทน)
        ...(date !== initialDate ? { occurredAt: date || null, isAllDay: true } : {}),
      }),
    onSuccess: (updated) => {
      refresh(updated);
      toast.success(t('saved'), { description: updated.title });
      onClose();
    },
    onError: (error) => {
      const conflict = error instanceof ApiError && error.status === 409;
      toast.error(conflict ? t('conflict') : t('saveFailed'), {
        description: conflict ? undefined : errorText(error),
      });
      if (conflict) void queryClient.invalidateQueries({ queryKey: taskDetailKey(entry.id) });
    },
  });

  const toggle = useMutation({
    mutationFn: () =>
      done
        ? entriesApi.update(entry.id, { status: 'pending', version: entry.version })
        : entriesApi.complete(entry.id),
    onSuccess: (updated) => {
      refresh(updated);
      toast.success(done ? t('reopened') : t('completed'), { description: entry.title });
    },
    onError: (error) =>
      toast.error(done ? t('reopenFailed') : t('completeFailed'), {
        description: errorText(error),
      }),
  });

  const payload = taskPayloadSchema.safeParse(entry.payload ?? {});
  const github = payload.success ? payload.data.github : undefined;
  const projectName = entry.projectId
    ? projects.data?.find((p) => p.id === entry.projectId)?.name
    : undefined;
  const stamp = (iso: string) =>
    dateTimeFormat(locale, { timeZone, dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(iso),
    );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (dirty && title.trim()) save.mutate();
      }}
      className="space-y-4 p-5 text-sm"
    >
      <div className="flex items-start gap-3 rounded-row bg-sunken p-3">
        <Checkbox
          checked={done}
          disabled={toggle.isPending}
          onCheckedChange={() => toggle.mutate()}
          aria-label={done ? t('markNotDone') : t('markDone')}
          className="mt-0.5"
        />
        <div className="min-w-0 flex-1">
          <p className="font-medium">{done ? t('statusDone') : t('statusOpen')}</p>
          <p className="text-xs text-fg-secondary">
            {done && entry.completedAt
              ? t('completedAt', { when: stamp(entry.completedAt) })
              : t('createdAt', { when: stamp(entry.createdAt) })}
          </p>
        </div>
        {done ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={toggle.isPending}
            onClick={() => toggle.mutate()}
          >
            <Undo2 size={14} aria-hidden="true" /> {t('reopen')}
          </Button>
        ) : null}
      </div>

      <div>
        <Label htmlFor="task-detail-name">{t('name')}</Label>
        <Input
          id="task-detail-name"
          value={title}
          maxLength={200}
          required
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between gap-3">
          <Label htmlFor="task-detail-description" className="mb-0">
            {t('description')}
          </Label>
          <SegmentedControl<DescriptionMode>
            label={t('descriptionMode')}
            size="sm"
            value={descriptionMode}
            onChange={setDescriptionMode}
            options={[
              { value: 'preview', label: t('preview') },
              { value: 'write', label: t('write') },
            ]}
          />
        </div>
        {descriptionMode === 'write' ? (
          <textarea
            id="task-detail-description"
            value={description}
            maxLength={20_000}
            rows={10}
            placeholder={t('descriptionPlaceholder')}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full resize-y rounded-control border border-hairline-strong bg-surface px-3.5 py-2.5 font-mono text-[13px] text-fg transition-[border-color,box-shadow] duration-[180ms] placeholder:text-fg-tertiary focus-visible:border-accent focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
          />
        ) : (
          // แสดงผลแบบ GitHub — ดับเบิลคลิกเพื่อแก้ (เหมือนกดแท็บ "เขียน")
          <div
            id="task-detail-description"
            onDoubleClick={() => setDescriptionMode('write')}
            className="max-h-[50dvh] min-h-24 overflow-y-auto rounded-control border border-hairline px-4 py-3"
          >
            {description.trim() ? (
              <Markdown>{description}</Markdown>
            ) : (
              <p className="text-sm text-fg-tertiary">{t('noDescription')}</p>
            )}
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="task-detail-due">{t('due')}</Label>
          <Input
            id="task-detail-due"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="font-mono"
          />
        </div>
        <div>
          <Label htmlFor="task-detail-priority">{t('priority')}</Label>
          <Select
            id="task-detail-priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority)}
            className="h-10 w-full"
          >
            {prioritySchema.options.map((p) => (
              <option key={p} value={p}>
                {priorityLabel(p)}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {projectName || entry.tags.length || github?.url ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {projectName ? <Badge tone="outline">{projectName}</Badge> : null}
          {entry.tags.map((tag) => (
            <span key={tag.id} className="font-mono text-[11px] text-fg-secondary">
              #{tag.name}
            </span>
          ))}
          {github?.url ? (
            <a
              href={github.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
            >
              {github.prNumber ? (
                <GitPullRequest size={13} aria-hidden="true" />
              ) : (
                <CircleDot size={13} aria-hidden="true" />
              )}
              {github.repo}#{github.prNumber ?? github.issueNumber}
              <ExternalLink size={12} aria-hidden="true" />
            </a>
          ) : null}
        </div>
      ) : null}

      <div className="flex justify-end gap-2 border-t border-hairline pt-4">
        <Button type="button" variant="ghost" onClick={onClose}>
          {t('cancel')}
        </Button>
        <Button type="submit" disabled={!dirty || !title.trim() || save.isPending}>
          {t('save')}
        </Button>
      </div>
    </form>
  );
}
