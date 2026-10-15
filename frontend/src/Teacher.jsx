import { useEffect, useRef, useState } from 'react';
import { api, refreshSession } from './api.js';
import { ErrorMessage } from './App.jsx';
import { TeacherClassrooms } from './Classrooms.jsx';

const formatDate = date => date ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(date)) : 'Aucune réponse';
const percentage = (count, total) => total ? Math.round(count * 100 / total) : 0;

function PrivateStudents() {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    setResult(null);
    setError(null);
    api(`/teacher/students?page=${page}`, { signal: controller.signal }).then(setResult).catch(failure => { if (failure.name !== 'AbortError') setError(failure); });
    return () => controller.abort();
  }, [page]);
  return <section className="private-section">
    <div className="notice">Vue confidentielle : ne la projetez pas au groupe. Les noms et adresses e-mail sont réservés à l’enseignant.</div>
    <ErrorMessage error={error} />
    {!result && !error && <p role="status">Chargement des participations…</p>}
    {result?.students.map(student => <details className="student-detail" key={student.id}><summary><strong>{student.first_name} {student.last_name}</strong><span>{formatDate(student.created_at)}</span></summary><dl><dt>E-mail universitaire</dt><dd>{student.email}</dd></dl></details>)}
    {result?.students.length === 0 && <p>Aucune participation pour le moment.</p>}
    <div className="pagination"><button className="button secondary" disabled={page === 1 || !result} onClick={() => setPage(value => value - 1)}>← Précédente</button><span>Page {page}</span><button className="button secondary" disabled={!result?.hasNext} onClick={() => setPage(value => value + 1)}>Suivante →</button></div>
  </section>;
}

function QuestionResults({ questions }) {
  return <>
    <div className="chart-heading"><h2>Les notions à reprendre ensemble</h2><div className="chart-legend"><span className="correct">Compris</span><span className="incorrect">À reprendre</span><span className="unknown">Je ne sais pas</span></div></div>
    <div className="question-results">{questions.map(question => <article className="result-card" key={question.id}>
      <div className="result-top"><span className="eyebrow">Question {question.id} · {question.domain}</span><strong>{percentage(question.correct_count, question.total)} %<small> de réponses correctes</small></strong></div>
      <h3>{question.title}</h3>
      <div className="stacked-bar" role="img" aria-label={`${question.correct_count} réponses correctes, ${question.incorrect_count} incorrectes, ${question.unknown_count} je ne sais pas, sur ${question.total}`}>
        <span className="correct" style={{ width: `${question.total ? question.correct_count * 100 / question.total : 0}%` }} />
        <span className="incorrect" style={{ width: `${question.total ? question.incorrect_count * 100 / question.total : 0}%` }} />
        <span className="unknown" style={{ width: `${question.total ? question.unknown_count * 100 / question.total : 0}%` }} />
      </div>
      <p className="result-counts">{question.correct_count} comprises · {question.incorrect_count} à reprendre · {question.unknown_count} inconnues</p>
      <details><summary>Répartition par choix</summary>{question.choices.map(choice => <div className="choice-count" key={choice.key}><span>{choice.key}. {choice.label}{choice.key === question.correct && <small className="correct-label">Réponse attendue</small>}</span><strong>{question.counts[choice.key]} <small>({percentage(question.counts[choice.key], question.total)} %)</small></strong></div>)}</details>
    </article>)}</div>
  </>;
}

export default function Teacher({ initialSession }) {
  const [authenticated, setAuthenticated] = useState(initialSession.teacher);
  const [dashboard, setDashboard] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [privateView, setPrivateView] = useState(false);
  const [liveView, setLiveView] = useState(false);
  const refreshRef = useRef(null);
  useEffect(() => {
    if (!authenticated) return;
    let stopped = false;
    let timer;
    let controller;
    let loading = false;
    const refresh = async () => {
      if (loading || stopped) return;
      loading = true;
      controller = new AbortController();
      try {
        const result = await api('/teacher/dashboard', { signal: controller.signal });
        if (!stopped) { setDashboard(result); setError(null); }
      } catch (failure) {
        if (!stopped && failure.name !== 'AbortError') {
          if (failure.status === 401) { setAuthenticated(false); setDashboard(null); setPrivateView(false); }
          setError(failure);
        }
      } finally {
        loading = false;
        if (!stopped) { clearTimeout(timer); timer = setTimeout(refresh, 10000); }
      }
    };
    refreshRef.current = refresh;
    refresh();
    return () => { stopped = true; clearTimeout(timer); controller?.abort(); refreshRef.current = null; };
  }, [authenticated]);
  const login = async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    setBusy(true); setError(null);
    try {
      await refreshSession();
      await api('/teacher/login', { method: 'POST', body: { username: fields.get('username'), password: fields.get('password') } });
      form.reset(); setAuthenticated(true);
    } catch (failure) { setError(failure); } finally { setBusy(false); }
  };
  const logout = async () => {
    setBusy(true);
    try { await refreshSession(); await api('/teacher/logout', { method: 'POST', body: {} }); setAuthenticated(false); setDashboard(null); setPrivateView(false); setError(null); } catch (failure) { setError(failure); } finally { setBusy(false); }
  };
  if (!authenticated) return <main className="teacher-login"><div><span className="eyebrow">Espace enseignant</span><h1>Les acquis<br /><em>du groupe.</em></h1><p>Repérer les notions retenues après la séance 1 et préparer la suite. Aucun classement des étudiants.</p></div><form className="login-card" onSubmit={login}><h2>Connexion protégée</h2><p className="hint">Identifiants définis dans la configuration de l’application.</p><div className="field"><label htmlFor="username">Identifiant</label><input id="username" name="username" autoComplete="username" required maxLength={120} /></div><div className="field"><label htmlFor="password">Mot de passe</label><input id="password" name="password" type="password" autoComplete="current-password" required maxLength={256} /></div><ErrorMessage error={error} /><button className="button primary" disabled={busy}>{busy ? 'Connexion…' : 'Se connecter →'}</button></form></main>;
  return <main className="dashboard">
    <div className="dashboard-heading"><div><span className="eyebrow">Séance 01 · Vue enseignant</span><h1>Les acquis après la séance 1.</h1><p>Actualisation toutes les 10 secondes. Les résultats servent à accompagner, pas à noter.</p></div><button className="button secondary" disabled={busy} onClick={logout}>Se déconnecter</button></div>
    <div className="dashboard-toolbar"><div className="view-tabs"><button className={!privateView && !liveView ? 'active' : ''} aria-pressed={!privateView && !liveView} onClick={() => { setPrivateView(false); setLiveView(false); }}>Résultats agrégés</button><button className={privateView && !liveView ? 'active' : ''} aria-pressed={privateView && !liveView} onClick={() => { setPrivateView(true); setLiveView(false); }}>Participations confidentielles</button><button className={liveView ? 'active' : ''} aria-pressed={liveView} onClick={() => setLiveView(true)}>Séances en direct</button></div><button className="text-button" onClick={() => refreshRef.current?.()}>↻ Actualiser</button></div>
    <ErrorMessage error={error} />
    {liveView ? <TeacherClassrooms /> : dashboard && <>
      <section className="metrics"><div><span>Réponses enregistrées</span><strong>{dashboard.total}</strong></div><div><span>Dernière soumission</span><strong className="metric-date">{formatDate(dashboard.lastSubmission)}</strong></div><div><span>Dernière actualisation réussie</span><strong className="metric-date">{formatDate(dashboard.updatedAt)}</strong></div></section>
      {error && <p className="hint" role="status">Les données affichées correspondent à la dernière actualisation réussie.</p>}
      {privateView ? <PrivateStudents /> : <QuestionResults questions={dashboard.questions} />}
    </>}
    {!dashboard && !error && <p role="status">Chargement des résultats…</p>}
  </main>;
}
