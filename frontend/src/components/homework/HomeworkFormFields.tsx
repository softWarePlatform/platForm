import { Link } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import FormSection from "../layout/FormSection";
import type { HomeworkAttachmentRow, HomeworkFormValues, RubricItem } from "./homeworkFormTypes";
import { isAllowedHomeworkFile } from "./homeworkFormApi";

type ClassRow = { id: string; name: string };

type Props = {
  courseId: string;
  values: HomeworkFormValues;
  onChange: (v: HomeworkFormValues) => void;
  classes: ClassRow[];
  showPublishCheckbox?: boolean;
  existingAttachments?: HomeworkAttachmentRow[];
  pendingFiles?: File[];
  onPendingFilesChange?: (files: File[]) => void;
  onDeleteAttachment?: (id: string) => void;
  rubricFileName?: string | null;
  pendingRubricFile?: File | null;
  onPendingRubricFileChange?: (f: File | null) => void;
};

function updateRubric(list: RubricItem[], idx: number, patch: Partial<RubricItem>): RubricItem[] {
  return list.map((r, i) => (i === idx ? { ...r, ...patch } : r));
}

export default function HomeworkFormFields({
  courseId,
  values,
  onChange,
  classes,
  showPublishCheckbox = true,
  existingAttachments = [],
  pendingFiles = [],
  onPendingFilesChange,
  onDeleteAttachment,
  rubricFileName,
  pendingRubricFile,
  onPendingRubricFileChange,
}: Props) {
  const set = (patch: Partial<HomeworkFormValues>) => onChange({ ...values, ...patch });

  const totalAttachments = existingAttachments.length + pendingFiles.length;

  function onPickAttachments(files: FileList | null) {
    if (!files || !onPendingFilesChange) return;
    const next: File[] = [...pendingFiles];
    for (const f of Array.from(files)) {
      if (!isAllowedHomeworkFile(f.name)) continue;
      if (f.size > 20 * 1024 * 1024) continue;
      if (totalAttachments + next.length >= 10) break;
      next.push(f);
    }
    onPendingFilesChange(next);
  }

  return (
    <div className="homework-form-fields">
      <FormSection title="基本信息">
        <div className="field">
          <label>
            作业标题 <span className="field-label-muted">1–100 字</span>
          </label>
          <input
            value={values.title}
            onChange={(e) => set({ title: e.target.value })}
            maxLength={100}
            required
          />
          <div className="field-foot">{values.title.length}/100</div>
        </div>

        <div>
          <label className="field-label">作业描述</label>
          <div className="md-editor">
            <textarea
              className="md-editor__input"
              rows={10}
              value={values.descriptionMd}
              onChange={(e) => set({ descriptionMd: e.target.value })}
              placeholder="## 要求&#10;- 提交 PDF 报告&#10;- 附源代码 zip"
            />
            <div className="md-preview">
              <ReactMarkdown>{values.descriptionMd || "（预览）"}</ReactMarkdown>
            </div>
          </div>
        </div>
      </FormSection>

      <FormSection title="时间与对象">
        <div className="field-row">
          <div className="field">
            <label>截止时间</label>
            <input
              type="datetime-local"
              value={values.dueAt}
              onChange={(e) => set({ dueAt: e.target.value })}
            />
          </div>
          <div className="field">
            <label>发布对象</label>
            <select
              className="dash-select"
              value={values.audience}
              onChange={(e) => {
                const audience = e.target.value as "all" | "class";
                set({ audience, targetClassId: audience === "all" ? "" : values.targetClassId });
              }}
            >
              <option value="all">全课程</option>
              <option value="class">指定班级</option>
            </select>
            {values.audience === "class" ? (
              classes.length > 0 ? (
                <select
                  className="dash-select"
                  style={{ marginTop: 8 }}
                  value={values.targetClassId}
                  onChange={(e) => set({ targetClassId: e.target.value })}
                  required
                >
                  <option value="">选择班级</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="field-foot">
                  <Link to={`/courses/${courseId}/manage`}>课程管理</Link> 建班
                </div>
              )
            ) : null}
          </div>
        </div>
      </FormSection>

      <FormSection title={`附件（${totalAttachments}/10）`}>
        {onPendingFilesChange ? (
          <label className="btn" style={{ width: "fit-content", cursor: "pointer" }}>
            添加附件
            <input
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.zip,.rar"
              style={{ display: "none" }}
              onChange={(e) => {
                onPickAttachments(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
        ) : null}
        {(existingAttachments.length > 0 || pendingFiles.length > 0) ? (
          <ul className="file-list">
            {existingAttachments.map((a) => (
              <li key={a.id} className="file-list__item">
                <span>
                  {a.fileName} <span className="muted">({(a.sizeBytes / 1024).toFixed(0)} KB)</span>
                </span>
                {onDeleteAttachment ? (
                  <button type="button" className="btn btn--sm" onClick={() => onDeleteAttachment(a.id)}>
                    删除
                  </button>
                ) : null}
              </li>
            ))}
            {pendingFiles.map((f, i) => (
              <li key={`${f.name}-${i}`} className="file-list__item">
                <span className="muted">{f.name}（待上传）</span>
                {onPendingFilesChange ? (
                  <button
                    type="button"
                    className="btn btn--sm"
                    onClick={() => onPendingFilesChange(pendingFiles.filter((_, j) => j !== i))}
                  >
                    移除
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="form-section__empty">暂无附件</p>
        )}
      </FormSection>

      <FormSection title="迟交">
        <label className="check-row">
          <input
            type="checkbox"
            checked={values.allowLate}
            onChange={(e) => set({ allowLate: e.target.checked })}
          />
          <span>允许迟交</span>
        </label>
        {values.allowLate ? (
          <div className="field-row">
            <div className="field">
              <label>每日扣减（%）</label>
              <input
                type="number"
                min={0}
                max={100}
                value={values.latePenaltyPercentPerDay}
                onChange={(e) => set({ latePenaltyPercentPerDay: Number(e.target.value) || 0 })}
              />
            </div>
            <div className="field">
              <label>超过天数计 0 分</label>
              <input
                type="number"
                min={1}
                max={365}
                value={values.lateMaxDays}
                onChange={(e) => set({ lateMaxDays: Number(e.target.value) || 1 })}
              />
            </div>
          </div>
        ) : null}
      </FormSection>

      <FormSection title="重做与提交">
        <label className="check-row">
          <input
            type="checkbox"
            checked={values.allowRedo}
            onChange={(e) => set({ allowRedo: e.target.checked })}
          />
          <span>允许重做</span>
        </label>
        {values.allowRedo ? (
          <>
            <div className="field">
              <label>最多重做次数</label>
              <select
                className="dash-select"
                value={values.maxRedoOption}
                onChange={(e) =>
                  set({ maxRedoOption: e.target.value as HomeworkFormValues["maxRedoOption"] })
                }
              >
                <option value="1">1 次</option>
                <option value="3">3 次</option>
                <option value="5">5 次</option>
                <option value="unlimited">无限次</option>
              </select>
            </div>
            <label className="check-row">
              <input
                type="checkbox"
                checked={values.redoReasonRequired}
                onChange={(e) => set({ redoReasonRequired: e.target.checked })}
              />
              <span>重做理由必填</span>
            </label>
            <div className="field">
              <label>重做后成绩</label>
              <select
                className="dash-select"
                value={values.redoGradePolicy}
                onChange={(e) =>
                  set({ redoGradePolicy: e.target.value as "REPLACE" | "KEEP_MAX" })
                }
              >
                <option value="KEEP_MAX">保留最高分</option>
                <option value="REPLACE">覆盖原成绩</option>
              </select>
            </div>
          </>
        ) : null}
        <div className="field">
          <label>作答方式</label>
          <div className="segmented">
            {[
              { value: "RICH_TEXT", label: "文本" },
              { value: "FILE", label: "文件" },
              { value: "RICH_TEXT_OR_FILE", label: "文本+文件" },
            ].map((opt) => {
              const active = values.answerMode === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  className={`segmented__btn${active ? " segmented__btn--active" : ""}`}
                  onClick={() => set({ answerMode: opt.value as HomeworkFormValues["answerMode"] })}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
        <label className="check-row">
          <input
            type="checkbox"
            checked={values.allowMultipleSubmits}
            onChange={(e) => set({ allowMultipleSubmits: e.target.checked })}
          />
          <span>允许多次提交</span>
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            checked={values.requireAttachment}
            onChange={(e) => set({ requireAttachment: e.target.checked })}
          />
          <span>附件必传</span>
        </label>
        <div className="field-row">
          <div className="field">
            <label>提交类型</label>
            <select
              className="dash-select"
              value={values.submissionType}
              onChange={(e) => set({ submissionType: e.target.value as "INDIVIDUAL" | "GROUP" })}
            >
              <option value="INDIVIDUAL">个人</option>
              <option value="GROUP">小组</option>
            </select>
          </div>
          {values.submissionType === "GROUP" ? (
            <div className="field">
              <label>小组人数上限</label>
              <input
                type="number"
                min={2}
                max={50}
                value={values.maxGroupSize}
                onChange={(e) => set({ maxGroupSize: Number(e.target.value) || 2 })}
              />
            </div>
          ) : null}
        </div>
      </FormSection>

      <FormSection title="评分标准">
        {values.rubric.map((r, i) => (
          <div key={i} className="rubric-row">
            <input
              placeholder="维度"
              value={r.name}
              onChange={(e) => set({ rubric: updateRubric(values.rubric, i, { name: e.target.value }) })}
            />
            <input
              type="number"
              min={0}
              max={1000}
              placeholder="满分"
              value={r.maxScore}
              onChange={(e) =>
                set({
                  rubric: updateRubric(values.rubric, i, { maxScore: Number(e.target.value) || 0 }),
                })
              }
            />
            <button
              type="button"
              className="btn btn--sm"
              onClick={() => set({ rubric: values.rubric.filter((_, j) => j !== i) })}
            >
              删除
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn btn--sm"
          onClick={() => set({ rubric: [...values.rubric, { name: "", maxScore: 0 }] })}
        >
          添加维度
        </button>
        {onPendingRubricFileChange ? (
          <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <label className="btn btn--sm" style={{ cursor: "pointer", margin: 0 }}>
              上传评分文件
              <input
                type="file"
                accept=".pdf,.doc,.docx,.zip,.rar"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  if (f && !isAllowedHomeworkFile(f.name)) return;
                  onPendingRubricFileChange(f);
                  e.target.value = "";
                }}
              />
            </label>
            {rubricFileName ? <span className="muted">已上传：{rubricFileName}</span> : null}
            {pendingRubricFile ? <span className="muted">待上传：{pendingRubricFile.name}</span> : null}
          </div>
        ) : null}
      </FormSection>

      {showPublishCheckbox ? (
        <label className="publish-toggle">
          <input
            type="checkbox"
            checked={values.publishNow}
            onChange={(e) => set({ publishNow: e.target.checked })}
          />
          <span>保存后立即发布</span>
        </label>
      ) : null}
    </div>
  );
}
