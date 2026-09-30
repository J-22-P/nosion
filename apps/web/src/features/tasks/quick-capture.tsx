'use client';

import type { CreateEntryInput, ProjectDto, TagDto } from '@nosion/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarDays, CirclePlus, Folder, Hash, X } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { cn } from '@nosion/ui';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { projectsApi, tagsApi } from '@/features/entries/api';
import { useCreateEntry, useProjects, useTags } from '@/features/entries/use-entries';
import { ApiError } from '@/lib/api-client';
import { PRIORITY_LABEL } from '@/lib/format';
import { parseQuickCapture, removeToken, sameName, type ParsedToken } from './quick-capture-parser';

/**
 * NL quick-add bar (สเปก 8.7.5 / 8.11.2) — เวอร์ชัน regex ก่อน Phase 5
 * พิมพ์ "fix login !urgent #backend +auth-v2" แล้ว ↵ · Esc ล้าง
 * แท็ก/โปรเจกต์ที่ยังไม่มีจะถูกสร้างให้ตอนบันทึก (บอกผู้ใช้ด้วย chip "ใหม่")
 */
export function QuickCapture() {
  const [text, setText] = useState('');
  const [due, setDue] = useState('');
  const parsed = useMemo(() => parseQuickCapture(text), [text]);
  const projects = useProjects();
  const tags = useTags();
  const create = useCreateEntry();
  const queryClient = useQueryClient();
  const [resolving, setResolving] = useState(false);
  const hintId = useId();

  const pending = create.isPending || resolving;
  const canSubmit = parsed.title.length > 0 && !pending;

  async function resolveProject(name: string | null): Promise<string | undefined> {
    if (!name) return undefined;
    const existing = projects.data?.find((p) => sameName(p.name, name));
    if (existing) return existing.id;
    const created = await projectsApi.create({ name });
    queryClient.setQueryData<ProjectDto[]>(['projects'], (old) => [...(old ?? []), created]);
    return created.id;
  }

  async function resolveTags(names: string[]): Promise<string[]> {
    const ids: string[] = [];
    for (const name of names) {
      const existing = tags.data?.find((t) => sameName(t.name, name));
      if (existing) {
        ids.push(existing.id);
        continue;
      }
      const created = await tagsApi.create({ name });
      queryClient.setQueryData<TagDto[]>(['tags'], (old) => [...(old ?? []), created]);
      ids.push(created.id);
    }
    return ids;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setResolving(true);
    let input: CreateEntryInput;
    try {
      const [projectId, tagIds] = await Promise.all([
        resolveProject(parsed.project),
        resolveTags(parsed.tags),
      ]);
      input = {
        module: 'task',
        title: parsed.title,
        ...(parsed.priority ? { priority: parsed.priority } : {}),
        ...(projectId ? { projectId } : {}),
        ...(tagIds.length ? { tagIds } : {}),
        ...(due ? { occurredAt: due } : {}),
      };
    } catch (error) {
      toast.error('สร้างแท็กหรือโปรเจกต์ไม่สำเร็จ', {
        description: error instanceof ApiError ? error.message : undefined,
      });
      return;
    } finally {
      setResolving(false);
    }
    create.mutate(input, {
      onSuccess: () => {
        setText('');
        setDue('');
      },
    });
  }

  function isNew(token: ParsedToken): boolean {
    if (token.kind === 'tag') return !tags.data?.some((t) => sameName(t.name, token.value));
    if (token.kind === 'project') return !projects.data?.some((p) => sameName(p.name, token.value));
    return false;
  }

  const showChips = parsed.tokens.length > 0 || due;

  return (
    <form
      onSubmit={submit}
      className="rounded-card border border-hairline bg-surface p-2 shadow-card transition-shadow focus-within:shadow-[var(--focus-ring)]"
    >
      <div className="flex items-center gap-2">
        <CirclePlus
          size={20}
          strokeWidth={1.75}
          className="ml-2 shrink-0 text-fg-secondary"
          aria-hidden="true"
        />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setText('');
              setDue('');
            }
          }}
          placeholder="เพิ่มงาน… เช่น แก้ bug login !urgent #backend +auth"
          aria-label="ชื่องานใหม่"
          aria-describedby={hintId}
          maxLength={200}
          className="h-11 min-w-0 flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-fg-tertiary"
        />
        <label className="relative hidden shrink-0 sm:block">
          <span className="sr-only">กำหนดส่ง</span>
          <input
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            className="h-9 rounded-control border border-hairline bg-wash px-2 font-mono text-xs text-fg-secondary outline-none focus-visible:shadow-[var(--focus-ring)]"
          />
        </label>
        <Button type="submit" disabled={!canSubmit} className="shrink-0 gap-2">
          <span className="hidden sm:inline">สร้างงาน</span>
          <span className="sm:hidden">เพิ่ม</span>
          <Kbd className="hidden border-transparent bg-current/15 text-current sm:inline-flex">
            ↵
          </Kbd>
        </Button>
      </div>

      <p id={hintId} className="sr-only">
        ใช้ !urgent !high !medium !low กำหนดความสำคัญ, #ชื่อแท็ก และ +ชื่อโปรเจกต์ · กด Escape
        เพื่อล้าง
      </p>

      {showChips ? (
        <div className="flex flex-wrap items-center gap-1.5 px-2 pb-1 pt-2" aria-live="polite">
          <span className="mr-1 inline-flex items-center gap-1.5 font-mono text-[11px] font-medium text-fg-secondary">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-success" />
            PARSED:
          </span>
          {due ? (
            <ParsedChip
              icon={<CalendarDays />}
              label={due}
              mono
              onRemove={() => setDue('')}
              removeLabel="ลบกำหนดส่ง"
            />
          ) : null}
          {parsed.tokens.map((token) => (
            <ParsedChip
              key={`${token.kind}:${token.raw}`}
              icon={token.kind === 'tag' ? <Hash /> : token.kind === 'project' ? <Folder /> : null}
              label={
                token.kind === 'priority'
                  ? `!${PRIORITY_LABEL[token.value]}`
                  : token.kind === 'project'
                    ? `+${token.value}`
                    : token.value
              }
              tone={token.kind === 'priority' && token.value === 'urgent' ? 'danger' : 'default'}
              isNew={isNew(token)}
              onRemove={() => setText((t) => removeToken(t, token.raw))}
              removeLabel={`ลบ ${token.raw}`}
            />
          ))}
        </div>
      ) : null}
    </form>
  );
}

function ParsedChip({
  icon,
  label,
  tone = 'default',
  mono = false,
  isNew = false,
  onRemove,
  removeLabel,
}: {
  icon: React.ReactNode;
  label: string;
  tone?: 'default' | 'danger';
  mono?: boolean;
  isNew?: boolean;
  onRemove: () => void;
  removeLabel: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1 rounded-chip pl-2 pr-1 text-xs font-medium [&_svg]:size-3',
        tone === 'danger' ? 'bg-danger-soft text-danger' : 'bg-wash-active text-fg',
        mono && 'font-mono text-[11px]',
      )}
    >
      {icon}
      {label}
      {isNew ? <span className="text-[10px] text-accent">ใหม่</span> : null}
      <button
        type="button"
        onClick={onRemove}
        aria-label={removeLabel}
        className="ml-0.5 flex size-4 items-center justify-center rounded-full hover:bg-wash-active"
      >
        <X size={10} aria-hidden="true" />
      </button>
    </span>
  );
}
