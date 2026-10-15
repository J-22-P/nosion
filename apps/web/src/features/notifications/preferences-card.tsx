'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input, Label } from '@/components/ui/input';
import { authApi, type MeResponse } from '@/features/auth/api';
import { ApiError } from '@/lib/api-client';

type Prefs = Pick<
  MeResponse['settings'],
  | 'quietHoursEnabled'
  | 'quietHoursStart'
  | 'quietHoursEnd'
  | 'dailyDigestEnabled'
  | 'dailyDigestTime'
>;

const pick = (s: MeResponse['settings']): Prefs => ({
  quietHoursEnabled: s.quietHoursEnabled,
  quietHoursStart: s.quietHoursStart,
  quietHoursEnd: s.quietHoursEnd,
  dailyDigestEnabled: s.dailyDigestEnabled,
  dailyDigestTime: s.dailyDigestTime,
});

/**
 * ห้ามรบกวน + อีเมลสรุปรายวัน (สเปก 6.2, 10.2) — ค่าของบัญชี ใช้กับทุกเครื่อง
 * เวลาทั้งหมดเป็นเวลาตามโซนของผู้ใช้ (แสดงไว้ในหัวการ์ดให้ชัด)
 */
export function PreferencesCard({ settings }: { settings: MeResponse['settings'] }) {
  const id = useId();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Prefs>(() => pick(settings));
  const saved = pick(settings);
  // ค่าจากเซิร์ฟเวอร์เปลี่ยน (บันทึกจากอีกแท็บ / เลิกรับผ่านอีเมล) → ตามค่าใหม่
  useEffect(() => setDraft(pick(settings)), [settings]);

  const dirty = (Object.keys(saved) as (keyof Prefs)[]).some((k) => saved[k] !== draft[k]);
  const sameQuiet = draft.quietHoursEnabled && draft.quietHoursStart === draft.quietHoursEnd;

  const save = useMutation({
    mutationFn: () => authApi.updateSettings(draft),
    onSuccess: (next) => {
      queryClient.setQueryData<MeResponse | null>(['session'], (prev) =>
        prev ? { ...prev, settings: next } : prev,
      );
      toast.success('บันทึกการตั้งค่าแล้ว');
    },
    onError: (error) =>
      toast.error('บันทึกไม่สำเร็จ', {
        description: error instanceof ApiError ? error.message : undefined,
      }),
  });

  const set = (patch: Partial<Prefs>) => setDraft((d) => ({ ...d, ...patch }));

  return (
    <Card>
      <CardHeader
        title="ห้ามรบกวนและสรุปรายวัน"
        description={`เวลาตามโซน ${settings.timezone} · ใช้กับทุกเครื่องของบัญชีนี้`}
      />
      <CardContent>
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (dirty && !sameQuiet) save.mutate();
          }}
        >
          <fieldset className="space-y-3">
            <legend className="sr-only">ห้ามรบกวน</legend>
            <div className="flex items-start gap-3">
              <Checkbox
                id={`${id}-quiet`}
                shape="square"
                checked={draft.quietHoursEnabled}
                onCheckedChange={(quietHoursEnabled) => set({ quietHoursEnabled })}
                aria-describedby={`${id}-quiet-hint`}
                className="mt-0.5"
              />
              <div>
                <label htmlFor={`${id}-quiet`} className="text-sm font-medium">
                  ห้ามรบกวน
                </label>
                <p id={`${id}-quiet-hint`} className="text-xs text-fg-secondary">
                  การเตือนที่ตรงกับช่วงนี้จะถูกเลื่อนไปส่งตอนช่วงจบ — ไม่หาย
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-3 pl-8">
              <div>
                <Label htmlFor={`${id}-qs`}>ตั้งแต่</Label>
                <Input
                  id={`${id}-qs`}
                  type="time"
                  value={draft.quietHoursStart}
                  disabled={!draft.quietHoursEnabled}
                  onChange={(e) => set({ quietHoursStart: e.target.value })}
                  className="w-32"
                />
              </div>
              <div>
                <Label htmlFor={`${id}-qe`}>ถึง</Label>
                <Input
                  id={`${id}-qe`}
                  type="time"
                  value={draft.quietHoursEnd}
                  disabled={!draft.quietHoursEnabled}
                  onChange={(e) => set({ quietHoursEnd: e.target.value })}
                  aria-invalid={sameQuiet}
                  className="w-32"
                />
              </div>
            </div>
            {sameQuiet ? (
              <p role="alert" className="pl-8 text-xs text-danger">
                เวลาเริ่มกับเวลาจบต้องต่างกัน
              </p>
            ) : null}
          </fieldset>

          <fieldset className="space-y-3 border-t border-hairline pt-5">
            <legend className="sr-only">อีเมลสรุปรายวัน</legend>
            <div className="flex items-start gap-3">
              <Checkbox
                id={`${id}-digest`}
                shape="square"
                checked={draft.dailyDigestEnabled}
                onCheckedChange={(dailyDigestEnabled) => set({ dailyDigestEnabled })}
                aria-describedby={`${id}-digest-hint`}
                className="mt-0.5"
              />
              <div>
                <label htmlFor={`${id}-digest`} className="text-sm font-medium">
                  อีเมลสรุปรายวัน
                </label>
                <p id={`${id}-digest-hint`} className="text-xs text-fg-secondary">
                  งานเลยกำหนด งานวันนี้ และบิลใน 7 วัน — ไม่ส่งในวันที่ไม่มีอะไรค้าง
                </p>
              </div>
            </div>
            <div className="pl-8">
              <Label htmlFor={`${id}-dt`}>ส่งเวลา</Label>
              <Input
                id={`${id}-dt`}
                type="time"
                value={draft.dailyDigestTime}
                disabled={!draft.dailyDigestEnabled}
                onChange={(e) => set({ dailyDigestTime: e.target.value })}
                className="w-32"
              />
            </div>
          </fieldset>

          <div className="flex justify-end gap-2">
            {dirty ? (
              <Button variant="secondary" onClick={() => setDraft(saved)} disabled={save.isPending}>
                ยกเลิก
              </Button>
            ) : null}
            <Button type="submit" disabled={!dirty || sameQuiet || save.isPending}>
              {save.isPending ? 'กำลังบันทึก…' : 'บันทึก'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
