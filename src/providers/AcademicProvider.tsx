import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { getList } from "@/lib/api";
import { today } from "@/lib/dates";
import { useAuth } from "@/auth/AuthProvider";

interface AcademicYear {
  name: string;
  year_start_date?: string;
  year_end_date?: string;
}
interface AcademicTerm {
  name: string;
  academic_year?: string;
  term_start_date?: string;
  term_end_date?: string;
}

interface AcademicState {
  years: AcademicYear[];
  terms: AcademicTerm[];
  year: string | null;
  term: string | null;
  termsOfYear: AcademicTerm[];
  setYear: (y: string) => void;
  setTerm: (t: string) => void;
}

const AcademicContext = createContext<AcademicState>(null as unknown as AcademicState);
export const useAcademic = () => useContext(AcademicContext);

const KEY = "mbs-staff.academic";

export function AcademicProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ["academic-years-terms"],
    enabled: !!user,
    staleTime: 12 * 60 * 60 * 1000,
    queryFn: async () => {
      const [years, terms, populated] = await Promise.all([
        getList<AcademicYear>("Academic Year", {
          fields: ["name", "year_start_date", "year_end_date"],
          orderBy: "year_start_date desc",
          limit: 20,
        }),
        getList<AcademicTerm>("Academic Term", {
          fields: ["name", "academic_year", "term_start_date", "term_end_date"],
          orderBy: "term_start_date desc",
          limit: 50,
        }),
        // Which years actually have active sections. A brand-new academic year
        // exists on the calendar long before anything is set up inside it, and
        // defaulting to it shows every screen empty.
        getList<{ academic_year: string }>("Student Group", {
          filters: [["disabled", "=", 0]],
          fields: ["academic_year"],
          limit: 500,
        }).catch(() => [] as { academic_year: string }[]),
      ]);
      const withData = new Set(populated.map((g) => g.academic_year).filter(Boolean));
      return { years, terms, withData };
    },
  });

  const [selection, setSelection] = useState<{ year: string | null; term: string | null }>(() => {
    try {
      return JSON.parse(localStorage.getItem(KEY) || "null") ?? { year: null, term: null };
    } catch {
      return { year: null, term: null };
    }
  });

  // Default to the year containing today — but only if that year has sections
  // set up. Otherwise fall back to the most recent year that does, so the app
  // opens on data instead of on an empty shell.
  useEffect(() => {
    if (!data || selection.year) return;
    const t = today();
    const hasData = (y?: AcademicYear) => !!y && (data.withData.size === 0 || data.withData.has(y.name));
    const byDate =
      data.years.find((y) => y.year_start_date && y.year_end_date && y.year_start_date <= t && t <= y.year_end_date) ??
      data.years.find((y) => y.year_start_date && y.year_start_date <= t);
    const currentYear =
      (hasData(byDate) ? byDate : undefined) ??
      data.years.find(hasData) ??
      byDate ??
      data.years[0];
    const yearTerms = data.terms.filter((x) => x.academic_year === currentYear?.name);
    const currentTerm =
      yearTerms.find((x) => x.term_start_date && x.term_end_date && x.term_start_date <= t && t <= x.term_end_date) ??
      yearTerms[0];
    if (currentYear) setSelection({ year: currentYear.name, term: currentTerm?.name ?? null });
  }, [data, selection.year]);

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(selection));
  }, [selection]);

  const value = useMemo<AcademicState>(() => {
    const terms = data?.terms ?? [];
    const termsOfYear = terms.filter((t) => t.academic_year === selection.year);
    return {
      years: data?.years ?? [],
      terms,
      year: selection.year,
      term: selection.term,
      termsOfYear,
      setYear: (y: string) => {
        const first = terms.find((t) => t.academic_year === y);
        setSelection({ year: y, term: first?.name ?? null });
      },
      setTerm: (t: string) => setSelection((s) => ({ ...s, term: t })),
    };
  }, [data, selection]);

  return <AcademicContext.Provider value={value}>{children}</AcademicContext.Provider>;
}
