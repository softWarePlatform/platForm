import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useParams } from "react-router-dom";
import { api } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";

export type CourseContextValue = {
  courseId: string;
  course: any;
  err: string | null;
  setErr: (e: string | null) => void;
  user: ReturnType<typeof useAuth>["user"];
  token: string | null;
  isTeacher: boolean;
  canUseQA: boolean;
  labs: any[];
  labSets: any[];
  homework: any[];
  posts: any[];
  materials: any[];
  displayLabs: any[];
  displayHomework: any[];
  hwForm: {
    title: string;
    description: string;
    dueAt: string;
    targetClassId: string;
    published: boolean;
  };
  setHwForm: React.Dispatch<
    React.SetStateAction<{
      title: string;
      description: string;
      dueAt: string;
      targetClassId: string;
      published: boolean;
    }>
  >;
  hwDrafts: Record<string, string>;
  setHwDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  hwSubmissions: Record<string, any[]>;
  hwGradeDrafts: Record<string, { score: string; feedback: string }>;
  setHwGradeDrafts: React.Dispatch<
    React.SetStateAction<Record<string, { score: string; feedback: string }>>
  >;
  hwAiPreview: Record<string, { score: number; feedback: string; source?: string }>;
  setHwAiPreview: React.Dispatch<
    React.SetStateAction<Record<string, { score: number; feedback: string; source?: string }>>
  >;
  hwAiBusy: Record<string, boolean>;
  setHwAiBusy: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setHwSubmissions: React.Dispatch<React.SetStateAction<Record<string, any[]>>>;
  newPost: { title: string; body: string };
  setNewPost: React.Dispatch<React.SetStateAction<{ title: string; body: string }>>;
  refreshSideData: () => Promise<void>;
  enroll: () => Promise<void>;
  isEnrolled: boolean;
};

const CourseCtx = createContext<CourseContextValue | null>(null);

export function useCourse() {
  const v = useContext(CourseCtx);
  if (!v) throw new Error("useCourse must be used within CourseProvider");
  return v;
}

export function CourseProvider({ children }: { children: ReactNode }) {
  const { courseId = "" } = useParams();
  const { user, token } = useAuth();
  const [course, setCourse] = useState<any>(null);
  const [labs, setLabs] = useState<any[]>([]);
  const [labSets, setLabSets] = useState<any[]>([]);
  const [homework, setHomework] = useState<any[]>([]);
  const [posts, setPosts] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [newPost, setNewPost] = useState({ title: "", body: "" });
  const [hwForm, setHwForm] = useState({
    title: "",
    description: "",
    dueAt: "",
    targetClassId: "",
    published: false,
  });
  const [hwDrafts, setHwDrafts] = useState<Record<string, string>>({});
  const [hwSubmissions, setHwSubmissions] = useState<Record<string, any[]>>({});
  const [hwGradeDrafts, setHwGradeDrafts] = useState<Record<string, { score: string; feedback: string }>>({});
  const [hwAiPreview, setHwAiPreview] = useState<
    Record<string, { score: number; feedback: string; source?: string }>
  >({});
  const [hwAiBusy, setHwAiBusy] = useState<Record<string, boolean>>({});

  const canUseQA = useMemo(() => Boolean(token), [token]);

  const isTeacher = useMemo(() => {
    if (!user || !course) return false;
    if (user.role !== "TEACHER" && user.role !== "ADMIN") return false;
    if (user.role === "ADMIN") return true;
    return user.id === course.teacher?.id;
  }, [user, course]);

  const displayLabs = useMemo(() => {
    if (labs.length > 0) return labs;
    return course?.labs ? course.labs : labs;
  }, [labs, course?.labs]);

  const displayHomework = useMemo(() => {
    if (homework.length > 0) return homework;
    return course?.homeworks ? course.homeworks : homework;
  }, [homework, course?.homeworks]);

  const refreshSideData = useCallback(async () => {
    if (!token || !courseId) return;
    const [l, h, d, c, mat, ls] = await Promise.all([
      api.get(`/courses/${courseId}/labs`).catch(() => ({ data: { labs: [] } })),
      api.get(`/courses/${courseId}/homework`).catch(() => ({ data: { homework: [] } })),
      api.get(`/courses/${courseId}/discussions`).catch(() => ({ data: { posts: [] } })),
      api.get(`/courses/${courseId}`).catch(() => ({ data: { course: null } })),
      api.get(`/courses/${courseId}/materials`).catch(() => ({ data: { materials: [] } })),
      api.get(`/courses/${courseId}/lab-sets`).catch(() => ({ data: { labSets: [] } })),
    ]);
    setLabs(l.data.labs ?? []);
    setLabSets(ls.data.labSets ?? []);
    const hws = h.data.homework ?? [];
    setHomework(hws);
    setPosts(d.data.posts ?? []);
    if (c.data.course) setCourse(c.data.course);
    setMaterials(mat.data.materials ?? []);
  }, [courseId, token]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setErr(null);
      try {
        const { data } = await api.get(`/courses/${courseId}`);
        if (!cancelled) setCourse(data.course);
      } catch {
        if (!cancelled) setErr("课程不存在或无权查看");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [courseId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token || !courseId) return;
      try {
        const [l, h, d, ls] = await Promise.all([
          api.get(`/courses/${courseId}/labs`).catch(() => ({ data: { labs: [] } })),
          api.get(`/courses/${courseId}/homework`).catch(() => ({ data: { homework: [] } })),
          api.get(`/courses/${courseId}/discussions`).catch(() => ({ data: { posts: [] } })),
          api.get(`/courses/${courseId}/lab-sets`).catch(() => ({ data: { labSets: [] } })),
        ]);
        if (!cancelled) {
          setLabs(l.data.labs ?? []);
          setLabSets(ls.data.labSets ?? []);
          setHomework(h.data.homework ?? []);
          setPosts(d.data.posts ?? []);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [courseId, token]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token || !courseId) {
        setMaterials([]);
        return;
      }
      try {
        const { data } = await api.get(`/courses/${courseId}/materials`);
        if (!cancelled) setMaterials(data.materials ?? []);
      } catch {
        if (!cancelled) setMaterials([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [courseId, token]);

  useEffect(() => {
    if (!isTeacher || !token || !courseId) return;
    let cancelled = false;
    (async () => {
      for (const h of displayHomework) {
        try {
          const { data } = await api.get(`/homework/${h.id}/submissions`);
          if (cancelled) return;
          const list = data.submissions ?? [];
          setHwSubmissions((m) => ({ ...m, [h.id]: list }));
          setHwGradeDrafts((prev) => {
            const next = { ...prev };
            for (const s of list) {
              if (next[s.id] == null) {
                next[s.id] = {
                  score: s.score != null ? String(s.score) : "",
                  feedback: s.feedback ?? "",
                };
              }
            }
            return next;
          });
        } catch {
          /* ignore */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isTeacher, token, courseId, displayHomework]);

  const isEnrolled = Boolean(course?.isEnrolled);

  async function enroll() {
    setErr(null);
    try {
      await api.post(`/courses/${courseId}/enroll`, {});
      const { data } = await api.get(`/courses/${courseId}`);
      setCourse(data.course);
    } catch (e: unknown) {
      const msg =
        typeof e === "object" && e !== null && "response" in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : null;
      setErr(msg ?? "选课失败（可能需要学生账号，或已选过）");
    }
  }

  const value: CourseContextValue = {
    courseId,
    course,
    err,
    setErr,
    user,
    token,
    isTeacher,
    canUseQA,
    labs,
    labSets,
    homework,
    posts,
    materials,
    displayLabs,
    displayHomework,
    hwForm,
    setHwForm,
    hwDrafts,
    setHwDrafts,
    hwSubmissions,
    hwGradeDrafts,
    setHwGradeDrafts,
    hwAiPreview,
    setHwAiPreview,
    hwAiBusy,
    setHwAiBusy,
    setHwSubmissions,
    newPost,
    setNewPost,
    refreshSideData,
    enroll,
    isEnrolled,
  };

  return <CourseCtx.Provider value={value}>{children}</CourseCtx.Provider>;
}
