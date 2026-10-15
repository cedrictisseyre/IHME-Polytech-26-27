import { useEffect, useRef, useState } from 'react';
import { api, refreshSession } from './api.js';
import Teacher from './Teacher.jsx';
import { StudentClassrooms } from './Classrooms.jsx';

const steps = ['Vos coordonnées', 'Le bilan', 'Vérification'];
const baseUrl = import.meta.env.BASE_URL;

export function Header({ teacher = false }) {
  return <header className="site-header"><a className="brand" href={baseUrl} aria-label="Accueil du bilan"><span className="brand-mark">P<span>26</span></span><span>POLYTECH<span className="brand-caption">Atelier web & IA · 2026–2027</span></span></a><nav className="header-links" aria-label="Navigation principale"><a className="nav-link" href={`${baseUrl}seance`}>Séance en direct</a><a className="nav-link" href={teacher ? baseUrl : `${baseUrl}enseignant`}>{teacher ? '← Formulaire étudiant' : 'Espace enseignant ↗'}</a></nav></header>;
}

export function ErrorMessage({ error }) {
  return error ? <div className="notice error" role="alert"><strong>{error.message || error}</strong>{error.fields?.length > 0 && <ul>{error.fields.map((field, index) => <li key={index}>{field.path} : {field.message}</li>)}</ul>}</div> : null;
}

function Field({ label, name, value, onChange, multiline = false, hint, required = false, ...props }) {
  const Component = multiline ? 'textarea' : 'input';
  const hintId = `${name}-hint`;
  return <div className="field"><label htmlFor={name}>{label}{!required && <span className="optional">facultatif</span>}</label><Component id={name} name={name} value={value} onChange={event => onChange(name, event.target.value)} required={required} aria-describedby={hint ? hintId : undefined} {...props} />{hint && <p className="hint" id={hintId}>{hint}</p>}</div>;
}

function Profile({ data, update, questionnaire }) {
  return <>
    <div className="section-heading"><span className="eyebrow">01 / Vos coordonnées</span><h2>Avant de commencer.</h2><p>Seulement trois informations pour identifier votre participation au bilan de la séance 1.</p></div>
    <div className="grid-two"><Field label="Prénom" name="firstName" value={data.firstName} onChange={update} required maxLength={120} autoComplete="given-name" /><Field label="Nom" name="lastName" value={data.lastName} onChange={update} required maxLength={120} autoComplete="family-name" /><Field label="E-mail universitaire" name="email" type="email" value={data.email} onChange={update} required maxLength={254} autoComplete="email" hint={`Domaines autorisés : ${questionnaire.privacy.domains.join(', ')}`} /></div>
  </>;
}

function Diagnostic({ data, update, questionnaire }) {
  const answered = Object.keys(data.answers).length;
  return <><div className="section-heading"><span className="eyebrow">02 / Ce que vous avez retenu</span><h2>Douze questions, aucune note.</h2><p>Repensez aux notions de la séance 1 et répondez sans aide extérieure. Vous pouvez toujours choisir « Je ne sais pas ». Les explications arrivent après l’envoi.</p><span className="pill">{answered} / 12 réponses</span></div>{questionnaire.questions.map((question, index) => <fieldset className="question-card" key={question.id}><legend><span className="question-meta">Question {String(index + 1).padStart(2, '0')} · {question.domain}</span><span className="question-title">{question.title}</span></legend><div className="answer-options">{question.choices.map(choice => <label className={`answer-choice ${data.answers[question.id] === choice.key ? 'selected' : ''} ${choice.key === 'D' ? 'unknown' : ''}`} key={choice.key}><input type="radio" name={`question-${question.id}`} value={choice.key} required checked={data.answers[question.id] === choice.key} onChange={() => update('answers', { ...data.answers, [question.id]: choice.key })} /><span className="choice-letter">{choice.key}</span><span>{choice.label}</span></label>)}</div></fieldset>)}</>;
}

function Review({ data, questionnaire }) {
  return <><div className="section-heading"><span className="eyebrow">03 / Avant l’envoi</span><h2>Tout est prêt ?</h2><p>Vous pouvez revenir aux étapes précédentes pour modifier vos réponses. Une seule soumission est prévue par e-mail pour ce bilan.</p></div><div className="review-block"><h3>{data.firstName} {data.lastName}</h3><p>{data.email}</p></div><div className="review-block"><h3>Vos réponses au bilan</h3><ol className="review-answers">{questionnaire.questions.map(question => <li key={question.id}>{question.choices.find(choice => choice.key === data.answers[question.id])?.label || 'Réponse manquante'}</li>)}</ol></div><div className="notice">Aucun score ni classement. Le corrigé expliqué sera disponible dès que votre réponse aura été enregistrée.</div></>;
}

function Correction({ receipt }) {
  return <div className="correction"><div className="success-banner"><span className="success-icon" aria-hidden="true">✓</span><span className="eyebrow">Votre réponse est enregistrée</span><h1>Merci pour votre participation.</h1><p>Vos réponses aideront à préparer la suite du module. Voici les explications, pour apprendre — pas pour vous noter.</p></div><div className="correction-intro"><h2>Comprendre les réponses</h2><p>Les questions reprennent notre fil conducteur : une application de réservation de salles.</p></div>{receipt.questions.map(question => {
    const selected = question.choices.find(choice => choice.key === question.selected)?.label;
    const correct = question.choices.find(choice => choice.key === question.correct)?.label;
    return <article className="correction-card" key={question.id}><span className="eyebrow">Question {question.id} · {question.domain}</span><h3>{question.title}</h3><p className="your-answer">Votre réponse : {selected}</p><p className="correct-answer"><strong>À retenir :</strong> {correct}</p><p>{question.explanation}</p></article>;
  })}<div className="notice">Ce corrigé est affiché uniquement après l’enregistrement. Aucun score individuel n’est calculé.</div></div>;
}

function Student({ questionnaire }) {
  const [step, setStep] = useState(0);
  const [data, setData] = useState({ firstName: '', lastName: '', email: '', answers: {} });
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const requestId = useRef(crypto.randomUUID());
  const cardRef = useRef(null);
  const errorRef = useRef(null);
  useEffect(() => {
    const preventLeave = event => {
      if (!receipt && Object.values(data).some(value => typeof value === 'string' ? Boolean(value) : Object.keys(value).length > 0)) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', preventLeave);
    return () => window.removeEventListener('beforeunload', preventLeave);
  }, [data, receipt]);
  const update = (name, value) => { setData(previous => ({ ...previous, [name]: value })); setError(null); };
  const goTo = next => { setStep(next); setError(null); requestAnimationFrame(() => { cardRef.current?.focus(); cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }); };
  const submit = async event => {
    event.preventDefault();
    if (step < 2) {
      if (step === 0 && !questionnaire.privacy.domains.includes(data.email.trim().toLowerCase().split('@')[1])) { setError({ message: 'Utilisez une adresse universitaire d’un des domaines indiqués.' }); return; }
      goTo(step + 1);
      return;
    }
    setSending(true);
    setError(null);
    try {
      await refreshSession();
      const body = { ...data, version: questionnaire.version, requestId: requestId.current, answers: questionnaire.questions.map(question => ({ questionId: question.id, choice: data.answers[question.id] })) };
      setReceipt(await api('/submissions', { method: 'POST', body }));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (failure) {
      setError(failure);
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally {
      setSending(false);
    }
  };
  if (receipt) return <Correction receipt={receipt} />;
  return <main className="student-layout"><aside className="intro-panel"><span className="eyebrow">Séance 01 · Bilan des acquis</span><h1>Qu’avez-vous retenu ?<br /><em>Un bilan, sans note.</em></h1><p>Revenons sur le Web, les données et les outils découverts pendant la première séance.</p><div className="intro-tags"><span>Master / ingénieurs</span><span>12 questions · 8 minutes</span></div><nav aria-label="Étapes du formulaire"><ol className="steps">{steps.map((label, index) => <li className={index === step ? 'active' : index < step ? 'done' : ''} key={label} aria-current={index === step ? 'step' : undefined}><span>{index < step ? '✓' : String(index + 1).padStart(2, '0')}</span>{label}</li>)}</ol></nav><div className="intro-note"><strong>Vos réponses nous aident.</strong><p>Repérons les notions acquises et celles à revoir ensemble avant de poursuivre.</p></div><div className="privacy-note"><h2>Vos données</h2><p>Nom, prénom et e-mail universitaire : ces informations identifient votre participation et servent au suivi pédagogique. Les informations personnelles sont réservées à l’enseignant ; seuls les résultats agrégés sont présentés au groupe.</p><p>Suppression automatique après {questionnaire.privacy.retentionDays} jours. Contact pour vos questions ou une demande de suppression : <a href={`mailto:${questionnaire.privacy.contact}`}>{questionnaire.privacy.contact}</a>.</p><p>Vos réponses ne sont pas sauvegardées avant l’envoi. Évitez de fermer ou recharger cette page.</p></div></aside><section className="form-card" ref={cardRef} tabIndex={-1} aria-label={steps[step]}><div className="form-topline"><span>FAIRE LE POINT & COMPRENDRE</span><span>Étape {step + 1} / {steps.length}</span></div><form onSubmit={submit}>{step === 0 && <Profile data={data} update={update} questionnaire={questionnaire} />}{step === 1 && <Diagnostic data={data} update={update} questionnaire={questionnaire} />}{step === 2 && <Review data={data} questionnaire={questionnaire} />}<div ref={errorRef} tabIndex={-1}><ErrorMessage error={error} /></div><div className="form-actions">{step > 0 ? <button type="button" className="button secondary" disabled={sending} onClick={() => goTo(step - 1)}>← Précédent</button> : <span className="hint">Les champs sans mention « facultatif » sont requis.</span>}<button className="button primary" type="submit" disabled={sending}>{sending ? 'Enregistrement…' : step === 2 ? 'Envoyer et voir les explications →' : 'Continuer →'}</button></div></form></section></main>;
}

export default function App() {
  const teacherPage = window.location.pathname.replace(/\/$/, '') === `${baseUrl}enseignant`;
  const livePage = window.location.pathname.replace(/\/$/, '') === `${baseUrl}seance`;
  const [initial, setInitial] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    let active = true;
    Promise.all([api('/questionnaire'), refreshSession()]).then(([questionnaire, session]) => { if (active) setInitial({ questionnaire, session }); }).catch(failure => { if (active) setError(failure); });
    return () => { active = false; };
  }, []);
  return <><Header teacher={teacherPage} />{error ? <main className="loading-panel"><ErrorMessage error={error} /><button className="button primary" onClick={() => window.location.reload()}>Réessayer</button></main> : !initial ? <main className="loading-panel" role="status">Préparation du bilan…</main> : teacherPage ? <Teacher questionnaire={initial.questionnaire} initialSession={initial.session} /> : livePage ? <StudentClassrooms privacy={initial.questionnaire.privacy} /> : <Student questionnaire={initial.questionnaire} />}<footer className="site-footer"><span>Polytech · Bilan et séances en direct · 2026–2027</span><span>Comprendre · Construire · Vérifier</span></footer></>;
}
