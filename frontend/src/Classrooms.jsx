import { useCallback, useEffect, useState } from 'react';
import { api, refreshSession } from './api.js';
import { ErrorMessage } from './App.jsx';
import './classrooms.css';

const letters = ['A', 'B', 'C'];
const labels = { draft: 'Brouillon', open: 'Réponses ouvertes', closed: 'Clôturée' };

function usePoll(path) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    setData(null);
    setError(null);
    if (!path) return;
    let stopped = false;
    let timer;
    const controller = new AbortController();
    const refresh = async () => {
      try {
        const result = await api(path, { signal: controller.signal });
        if (!stopped) { setData(result); setError(null); }
      } catch (failure) {
        if (!stopped && failure.name !== 'AbortError') setError(failure);
      } finally {
        if (!stopped) timer = setTimeout(refresh, 10000);
      }
    };
    refresh();
    return () => { stopped = true; clearTimeout(timer); controller.abort(); };
  }, [path, revision]);
  return { data, error, reload };
}

function Input({ label, name, ...props }) {
  return <div className="field"><label htmlFor={name}>{label}</label><input id={name} name={name} required {...props} /></div>;
}

function StudentQuestion({ question, answered }) {
  const [selected, setSelected] = useState('');
  const [receipt, setReceipt] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const stored = question.selected ? question : receipt;
  const submit = async event => {
    event.preventDefault();
    setBusy(true); setError(null);
    try {
      await refreshSession();
      setReceipt(await api(`/student/questions/${question.id}/answer`, { method: 'POST', body: { choice: selected } }));
      answered();
    } catch (failure) { setError(failure); } finally { setBusy(false); }
  };
  return <article className="result-card live-question">
    <span className="eyebrow">{labels[question.status]}</span><h2>{question.title}</h2>
    {stored ? <div role="status"><p>Votre réponse : <strong>{stored.selected === 'D' ? 'Je ne sais pas' : `${stored.selected}. ${question.choices[letters.indexOf(stored.selected)]}`}</strong></p><p>Réponse attendue : <strong>{stored.correct}. {question.choices[letters.indexOf(stored.correct)]}</strong></p><p>{stored.explanation}</p></div>
      : question.status === 'closed' ? <p>Les réponses sont clôturées. Vous n’avez pas répondu à cette question.</p>
        : <form onSubmit={submit}><fieldset disabled={busy}><legend>Une seule réponse, définitive après l’envoi.</legend>{[...question.choices, 'Je ne sais pas'].map((label, index) => <label className="answer-choice" key={index}><input type="radio" name={`answer-${question.id}`} value={index === 3 ? 'D' : letters[index]} checked={selected === (index === 3 ? 'D' : letters[index])} onChange={event => setSelected(event.target.value)} required /><span>{label}</span></label>)}</fieldset><ErrorMessage error={error} /><button className="button primary" disabled={busy || !selected}>{busy ? 'Enregistrement…' : 'Envoyer ma réponse'}</button></form>}
  </article>;
}

export function StudentClassrooms({ privacy }) {
  const [student, setStudent] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [roomId, setRoomId] = useState('');
  const [register, setRegister] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const live = usePoll(student && roomId ? `/student/classrooms/${roomId}` : null);
  useEffect(() => {
    const controller = new AbortController();
    api('/student/me', { signal: controller.signal }).then(result => { setStudent(result.student); setRooms(result.classrooms); setRoomId(result.classrooms[0]?.id || ''); }).catch(failure => { if (failure.status !== 401 && failure.name !== 'AbortError') setError(failure); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (live.error?.status === 401) { setStudent(null); setError(live.error); }
  }, [live.error]);
  const authenticate = async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = Object.fromEntries(new FormData(form));
    setBusy(true); setError(null);
    try {
      await refreshSession();
      await api(`/student/${register ? 'register' : 'login'}`, { method: 'POST', body: fields });
      form.reset();
      const result = await api('/student/me');
      setStudent(result.student); setRooms(result.classrooms); setRoomId(result.classrooms[0]?.id || '');
    } catch (failure) { setError(failure); } finally { setBusy(false); }
  };
  const join = async event => {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true); setError(null);
    try {
      await refreshSession();
      const room = await api('/student/join', { method: 'POST', body: { code: new FormData(form).get('code') } });
      setRooms(previous => [room, ...previous.filter(existing => existing.id !== room.id)]); setRoomId(room.id); live.reload(); form.reset();
    } catch (failure) { setError(failure); } finally { setBusy(false); }
  };
  const logout = async () => {
    setBusy(true); setError(null);
    try {
      await refreshSession(); await api('/student/logout', { method: 'POST', body: {} });
      setStudent(null); setRooms([]); setRoomId('');
    } catch (failure) { setError(failure); } finally { setBusy(false); }
  };
  if (loading) return <main className="loading-panel" role="status">Recherche de votre session…</main>;
  if (!student) return <main className="dashboard live-layout"><h1>Participer en direct</h1><p>Retrouvez vos séances avec votre e-mail universitaire et votre mot de passe, même après une déconnexion.</p><div className="view-tabs"><button aria-pressed={!register} onClick={() => { setRegister(false); setError(null); }}>Se connecter</button><button aria-pressed={register} onClick={() => { setRegister(true); setError(null); }}>Créer mon compte</button></div><form className="login-card" key={String(register)} onSubmit={authenticate}>
    {register && <><Input label="Prénom" name="firstName" autoComplete="given-name" maxLength={120} /><Input label="Nom" name="lastName" autoComplete="family-name" maxLength={120} /></>}
    <Input label="E-mail universitaire" name="email" type="email" autoComplete="username" maxLength={254} /><Input label="Mot de passe" name="password" type="password" minLength={register ? 10 : 1} maxLength={256} autoComplete={register ? 'new-password' : 'current-password'} />
    <p className="hint">{register ? 'Choisissez au moins 10 caractères. Utilisez un mot de passe différent de celui de votre université.' : 'Utilisez le mot de passe choisi sur cette application, pas celui de votre université.'}</p><ErrorMessage error={error} /><button className="button primary" disabled={busy}>{busy ? 'Connexion…' : register ? 'Créer mon compte' : 'Me reconnecter'}</button>
  </form><div className="privacy-note"><p>Domaines autorisés : {privacy.domains.join(', ')}. L’adresse est déclarative : aucun e-mail de vérification n’est envoyé.</p><p>Compte supprimé après {privacy.retentionDays} jours sans reconnexion. Séances et réponses conservées au maximum {privacy.retentionDays} jours. Contact : <a href={`mailto:${privacy.contact}`}>{privacy.contact}</a>.</p></div></main>;
  return <main className="dashboard live-layout"><div className="dashboard-heading"><div><span className="eyebrow">Séance en direct · Non notée</span><h1>Bonjour {student.firstName}.</h1><p>{student.email} · Actualisation toutes les 10 secondes.</p></div><button className="button secondary" disabled={busy} onClick={logout}>Se déconnecter</button></div>
    <form className="live-join" onSubmit={join}><Input label="Code donné par l’enseignant" name="code" minLength={8} maxLength={8} autoComplete="off" /><button className="button primary" disabled={busy}>Rejoindre</button></form><ErrorMessage error={error} />
    {rooms.length > 0 && <div className="field"><label htmlFor="student-room">Mes séances</label><select id="student-room" value={roomId} onChange={event => setRoomId(event.target.value)}>{rooms.map(room => <option value={room.id} key={room.id}>{room.title}</option>)}</select></div>}
    <ErrorMessage error={live.error} />{live.error && <button className="button secondary" onClick={live.reload}>Réessayer</button>}
    {roomId && !live.data && !live.error && <p role="status">Chargement des questions…</p>}
    {live.data && <><h2>{live.data.classroom.title}</h2>{live.data.questions.length === 0 && <p role="status">Vous êtes bien connecté. Les questions apparaîtront ici quand l’enseignant les diffusera.</p>}{live.data.questions.map(question => <StudentQuestion question={question} answered={live.reload} key={question.id} />)}</>}
  </main>;
}

export function TeacherClassrooms() {
  const rooms = usePoll('/teacher/classrooms');
  const [roomId, setRoomId] = useState('');
  const live = usePoll(roomId ? `/teacher/classrooms/${roomId}` : null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showCorrections, setShowCorrections] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const perform = async action => {
    setBusy(true); setError(null);
    try { await refreshSession(); await action(); } catch (failure) { setError(failure); } finally { setBusy(false); }
  };
  const create = event => {
    event.preventDefault();
    const form = event.currentTarget;
    const title = new FormData(form).get('title');
    perform(async () => { const room = await api('/teacher/classrooms', { method: 'POST', body: { title } }); setRoomId(room.id); rooms.reload(); form.reset(); });
  };
  const addQuestion = event => {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const body = { title: fields.get('questionTitle'), choices: letters.map(letter => fields.get(`choice${letter}`)), correct: fields.get('correct'), explanation: fields.get('explanation') };
    perform(async () => { await api(`/teacher/classrooms/${roomId}/questions`, { method: 'POST', body }); form.reset(); live.reload(); });
  };
  const changeStatus = (questionId, status) => perform(async () => { await api(`/teacher/classrooms/${roomId}/questions/${questionId}/status`, { method: 'POST', body: { status } }); live.reload(); });
  return <section className="live-layout" aria-label="Gestion des séances en direct"><h2>Questions pendant le cours</h2><p>Créez une séance, partagez son code, puis diffusez une question à la fois. Non noté ; corrigé individuel après enregistrement de la réponse.</p>
    <form className="live-join" onSubmit={create}><Input label="Titre de la nouvelle séance" name="title" maxLength={120} /><button className="button primary" disabled={busy}>Créer la séance</button></form>
    <ErrorMessage error={error || rooms.error || live.error} />
    {rooms.data && <div className="field"><label htmlFor="teacher-room">Séance à piloter</label><select id="teacher-room" value={roomId} onChange={event => { setRoomId(event.target.value); setShowEditor(false); setShowCorrections(false); }}>{!rooms.data.classrooms.some(room => room.id === roomId) && <option value="">Choisir une séance</option>}{rooms.data.classrooms.map(room => <option value={room.id} key={room.id}>{room.title}</option>)}</select></div>}
    {live.data && <><div className="notice"><strong>Code à partager : <span className="live-code">{live.data.classroom.code}</span></strong><p>{live.data.members} participant(s) inscrit(s). Ouvrir « Séance en direct » dans le menu de l’application.</p></div>
      <button className="button secondary" aria-expanded={showEditor} onClick={() => setShowEditor(value => !value)}>Préparer une question (confidentiel)</button>
      {showEditor && <form className="login-card live-editor" onSubmit={addQuestion}><p className="notice">Ne projetez pas cet éditeur : il contient le corrigé.</p><Input label="Question" name="questionTitle" maxLength={1000} />{letters.map(letter => <Input label={`Choix ${letter}`} name={`choice${letter}`} maxLength={500} key={letter} />)}<p className="hint">L’option « Je ne sais pas » est ajoutée automatiquement.</p><div className="field"><label htmlFor="correct">Bonne réponse</label><select name="correct" id="correct" required>{letters.map(letter => <option key={letter}>{letter}</option>)}</select></div><div className="field"><label htmlFor="explanation">Explication</label><textarea id="explanation" name="explanation" required maxLength={3000} /></div><button className="button primary" disabled={busy}>Enregistrer le brouillon</button></form>}
      <p><label><input type="checkbox" checked={showCorrections} onChange={event => setShowCorrections(event.target.checked)} /> Afficher les corrigés enseignant (ne pas projeter)</label></p>
      {live.data.questions.map(question => <article className="result-card live-question" key={question.id}><span className="eyebrow">{labels[question.status]}</span><h3>{question.title}</h3><p>{question.total} réponse(s) / {live.data.members} participant(s)</p>{[...question.choices, 'Je ne sais pas'].map((label, index) => <div className="choice-count" key={index}><span>{index === 3 ? 'D' : letters[index]}. {label}</span><strong>{question[['count_a', 'count_b', 'count_c', 'count_d'][index]]}</strong></div>)}{showCorrections && <p>Réponse attendue : {question.correct}. {question.explanation}</p>}<div className="form-actions">{question.status === 'draft' && <button className="button primary" disabled={busy} onClick={() => changeStatus(question.id, 'open')}>Diffuser (clôture la précédente)</button>}{question.status === 'open' && <button className="button secondary" disabled={busy} onClick={() => changeStatus(question.id, 'closed')}>Clôturer les réponses</button>}</div></article>)}
    </>}
  </section>;
}
