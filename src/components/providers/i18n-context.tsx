'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

export type Language = 'es' | 'en';

interface LanguageContextType {
    lang: Language;
    setLang: (lang: Language) => void;
    t: Record<string, string>;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const translations = {
    es: {
        nav_bots: "Bots",
        nav_users: "Usuarios",
        nav_conversations: "Conversaciones",
        nav_pricing: "Precios",
        nav_organizations: "Organizaciones",
        nav_lti: "LTI",
        nav_evaluators: "Evaluadores",
        nav_question_banks: "Bancos de preguntas",
        nav_qa_lab: "QA Lab",
        nav_logout: "Cerrar Sesión",
        nav_manual: "Manual Técnico",
        nav_admin: "Administración",
        bot_list_title: "Directorio de Bots",
        bot_list_desc: "Gestiona los directores de IA y sus estrategias.",
        user_list_title: "Gestión de Usuarios",
        user_list_desc: "Controla el acceso y las asignaciones de bots.",
        create_new: "Crear Nuevo",
        config: "Configurar",
        edit: "Practicar",
        delete: "Eliminar",
        save: "Guardar",
        cancel: "Cancelar",
        loading: "Cargando...",
        search: "Buscar...",
        lang_label: "Idioma",
        technical_manual: "Manual Técnico",
        // Conversations page
        conv_title: "Conversaciones",
        conv_desc: "Revisa el historial de sesiones de práctica.",
        conv_filter_date: "Rango de Fechas",
        conv_filter_user: "Buscar Usuario",
        conv_filter_user_placeholder: "ID / Nombre de usuario...",
        conv_filter_bot: "Simulador",
        conv_filter_all: "Todos los Simuladores",
        conv_filter_btn: "Filtrar",
        conv_col_date: "Fecha y Hora",
        conv_col_user: "Usuario",
        conv_col_bot: "Simulador",
        conv_col_action: "Acción",
        conv_view: "Ver",
        conv_empty: "No se encontraron conversaciones.",
        conv_page: "Página",
        conv_of: "de",
        conv_anonymous: "Anónimo",
        conv_back: "Volver a la lista",
        conv_session: "Sesión",
        conv_usage: "Uso y Costo",
        conv_total_cost: "Costo Total",
        conv_usd_est: "USD Est.",
        conv_tokens_in: "Tokens Entrada",
        conv_tokens_out: "Tokens Salida",
        conv_session_info: "Información de Sesión",
        conv_messages: "Mensajes",
        conv_started: "Inicio",
        conv_raw_meta: "Metadatos",
        conv_started_on: "Conversación iniciada el",
    },
    en: {
        nav_bots: "Bots",
        nav_users: "Users",
        nav_conversations: "Conversations",
        nav_pricing: "Pricing",
        nav_organizations: "Organizations",
        nav_lti: "LTI",
        nav_evaluators: "Evaluators",
        nav_question_banks: "Question banks",
        nav_qa_lab: "QA Lab",
        nav_logout: "Log Out",
        nav_manual: "Tech Manual",
        nav_admin: "Admin",
        bot_list_title: "Bot Directory",
        bot_list_desc: "Manage AI directors and their strategies.",
        user_list_title: "User Management",
        user_list_desc: "Control access and bot assignments.",
        create_new: "Create New",
        config: "Configure",
        edit: "Practice",
        delete: "Delete",
        save: "Save",
        cancel: "Cancel",
        loading: "Loading...",
        search: "Search...",
        lang_label: "Language",
        technical_manual: "Technical Manual",
        // Conversations page
        conv_title: "Conversations",
        conv_desc: "Review practice session history.",
        conv_filter_date: "Date Range",
        conv_filter_user: "User Search",
        conv_filter_user_placeholder: "User ID / Name...",
        conv_filter_bot: "Simulator",
        conv_filter_all: "All Simulators",
        conv_filter_btn: "Filter",
        conv_col_date: "Date & Time",
        conv_col_user: "User",
        conv_col_bot: "Simulator",
        conv_col_action: "Action",
        conv_view: "View",
        conv_empty: "No conversations found.",
        conv_page: "Page",
        conv_of: "of",
        conv_anonymous: "Anonymous",
        conv_back: "Back to list",
        conv_session: "Session",
        conv_usage: "Usage & Cost",
        conv_total_cost: "Total Cost",
        conv_usd_est: "USD Est.",
        conv_tokens_in: "Tokens In",
        conv_tokens_out: "Tokens Out",
        conv_session_info: "Session Info",
        conv_messages: "Messages",
        conv_started: "Started",
        conv_raw_meta: "Raw Metadata",
        conv_started_on: "Conversation started on",
    }
};

function persistLanguagePreference(lang: Language) {
    if (typeof window === 'undefined') return;
    localStorage.setItem('app-lang', lang);

    const secureCookie = window.location.protocol === 'https:';
    const sameSite = secureCookie ? 'none' : 'lax';
    const cookieParts = [
        `app-lang=${lang}`,
        'path=/',
        'max-age=31536000',
        `samesite=${sameSite}`,
    ];

    if (secureCookie) {
        cookieParts.push('secure');
    }

    document.cookie = cookieParts.join('; ');
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
    const [lang, setLangState] = useState<Language>('es');

    // Persistence in localStorage
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const saved = localStorage.getItem('app-lang') as Language;
        if (saved && (saved === 'es' || saved === 'en')) {
            setLangState(saved);
            persistLanguagePreference(saved);
            return;
        }
        const cookieLang = document.cookie
            .split('; ')
            .find((entry) => entry.startsWith('app-lang='))
            ?.split('=')[1] as Language | undefined;
        if (cookieLang === 'es' || cookieLang === 'en') {
            setLangState(cookieLang);
            persistLanguagePreference(cookieLang);
        }
    }, []);

    const setLang = (newLang: Language) => {
        setLangState(newLang);
        persistLanguagePreference(newLang);
    };

    const t = translations[lang];

    return (
        <LanguageContext.Provider value={{ lang, setLang, t }}>
            {children}
        </LanguageContext.Provider>
    );
}

export function useLanguage() {
    const context = useContext(LanguageContext);
    if (!context) {
        throw new Error('useLanguage must be used within a LanguageProvider');
    }
    return context;
}
