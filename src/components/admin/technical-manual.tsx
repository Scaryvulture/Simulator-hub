'use client';

import { useState, type ReactNode } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { useLanguage } from '@/components/providers/i18n-context';
import { BookOpen, Bot, Brain, Database, FileText, GitBranch, MessageSquare, Settings2, Zap, RotateCcw, Workflow, FileSearch, ShieldCheck, BrainCircuit, FlaskConical, Wrench, CheckCircle2, ClipboardList, Code2, ListChecks, Rocket } from 'lucide-react';

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

type SectionDef = {
    id: string;
    label: string;
    icon: ReactNode;
    render: () => ReactNode;
};

export function TechnicalManual({ open, onOpenChange }: Props) {
    const { lang, t } = useLanguage();
    const [activeSection, setActiveSection] = useState('overview');
    const tr = (es: string, en: string) => (lang === 'es' ? es : en);

    const sections: SectionDef[] = [
        {
            id: 'overview',
            label: tr('1. Visión General', '1. Overview'),
            icon: <BookOpen className="h-4 w-4" />,
            render: () => (
                <div className="space-y-8">
                    <SectionHeading
                        icon={<BrainCircuit className="h-8 w-8 text-primary" />}
                        title={tr('Cómo funciona todo el editor', 'How the full editor works')}
                        subtitle={tr(
                            'Pensalo como una obra de teatro: definís personaje, memoria y guion. El bot improvisa solo dentro de esas reglas.',
                            'Think of it as a stage play: you define character, memory, and script. The bot improvises only inside those rules.',
                        )}
                    />

                    <Grid>
                        <InfoCard
                            title={tr('Identidad del bot', 'Bot identity')}
                            body={tr(
                                'Define quién es el bot y qué rol ocupa. Si esta parte está mal, todo lo demás también se desordena.',
                                'Defines who the bot is and which role it plays. If this part is wrong, everything else gets unstable.',
                            )}
                        />
                        <InfoCard
                            title={tr('Memoria de sesión', 'Session memory')}
                            body={tr(
                                'Guarda datos vivos durante la conversación (ejemplo: nombre del usuario, intentos, estado del caso).',
                                'Stores live data during conversation (for example: user name, attempts, case status).',
                            )}
                        />
                        <InfoCard
                            title={tr('Motor de flujo', 'Flow engine')}
                            body={tr(
                                'Controla orden y condiciones de los pasos. Es el sistema que evita respuestas aleatorias.',
                                'Controls step order and conditions. This is what prevents random behavior.',
                            )}
                        />
                    </Grid>

                    <Callout
                        title={tr('Mapa mental recomendado', 'Recommended mental model')}
                        text={tr(
                            'Primero definí el resultado deseado de la sesión. Después diseñá variables mínimas, luego pasos mínimos, y recién al final refiná estilo, RAG y evaluación.',
                            'First define the desired session outcome. Then design minimum variables, then minimum steps, and only then refine style, RAG, and evaluation.',
                        )}
                    />
                </div>
            ),
        },
        {
            id: 'quickstart',
            label: tr('2. Primer Recorrido (Nuevo Ingreso)', '2. First Walkthrough (New Joiner)'),
            icon: <Zap className="h-4 w-4" />,
            render: () => (
                <div className="space-y-8">
                    <SectionHeading
                        icon={<Zap className="h-8 w-8 text-primary" />}
                        title={tr('Qué hacer de principio a fin (sin perderte)', 'What to do end-to-end (without getting lost)')}
                        subtitle={tr(
                            'Pensado para una persona nueva en la empresa: qué tocar primero, qué validar después y dónde mirar si algo no cierra.',
                            'Designed for a brand-new teammate: what to configure first, what to validate next, and where to look if behavior is unclear.',
                        )}
                    />

                    <Process
                        steps={[
                            tr('1) Crear bot y definir tipo (SIMULATOR / EXAMINER / DETECTOR / GENERIC).', '1) Create bot and define type (SIMULATOR / EXAMINER / DETECTOR / GENERIC).'),
                            tr('2) Cargar API Key, Modelo base y opcionalmente Prompt ID (pmpt_*).', '2) Set API key, base model, and optionally Prompt ID (pmpt_*).'),
                            tr('3) Configurar instrucciones claras: rol del bot, rol del usuario, límites y objetivo.', '3) Configure clear instructions: bot role, user role, limits, and objective.'),
                            tr('4) Armar lógica (variables + interrupciones globales + pasos) o banco de preguntas, según estrategia.', '4) Build logic (variables + global interrupts + steps) or question bank, depending on strategy.'),
                            tr('5) Ajustar RAG solo si necesitás evidencia documental real.', '5) Tune RAG only when you need real documentary evidence.'),
                            tr('6) Guardar, revisar warnings, probar chat real, correr QA Lab, y recién ahí publicar.', '6) Save, review warnings, test real chat, run QA Lab, and only then publish.'),
                        ]}
                    />

                    <Rows
                        rows={[
                            {
                                field: tr('Atajo mental', 'Mental shortcut'),
                                purpose: tr('Primero define conducta (instrucciones), después lógica (pasos), después datos (RAG), después calidad (QA).', 'First define behavior (instructions), then logic (steps), then data (RAG), then quality (QA).'),
                                example: tr('Conducta -> Lógica -> Evidencia -> QA -> Publicar', 'Behavior -> Logic -> Evidence -> QA -> Publish'),
                            },
                            {
                                field: tr('Señal de configuración sana', 'Healthy configuration signal'),
                                purpose: tr('Cualquier persona del equipo puede explicar en 1 minuto qué hace el bot y por qué responde así.', 'Any teammate can explain in 1 minute what the bot does and why it replies that way.'),
                                example: tr('Si no se puede explicar fácil, simplificar.', 'If it is hard to explain, simplify.'),
                            },
                            {
                                field: tr('Error típico de onboarding', 'Typical onboarding mistake'),
                                purpose: tr('Querer tocar todo junto (flujo + RAG + prompt + QA) sin pruebas intermedias.', 'Trying to change everything at once (flow + RAG + prompt + QA) without intermediate checks.'),
                                example: tr('Cambiar una capa por vez para aislar causa/efecto.', 'Change one layer at a time to isolate cause/effect.'),
                            },
                            {
                                field: tr('Regla de guardado/publicación', 'Save/publish rule'),
                                purpose: tr('Guardar permite continuar con warnings. Publicar bloquea solo errores críticos de flujo.', 'Save lets you continue with warnings. Publish blocks only critical flow errors.'),
                                example: tr('Warnings no bloquean; críticos sí.', 'Warnings do not block; critical issues do.'),
                            },
                        ]}
                    />
                </div>
            ),
        },
        {
            id: 'strategies',
            label: tr('3. Estrategia SIMULATOR (Guía Maestra)', '3. SIMULATOR Strategy (Master Guide)'),
            icon: <Bot className="h-4 w-4" />,
            render: () => (
                <div className="space-y-8">
                    <SectionHeading
                        icon={<Bot className="h-8 w-8 text-primary" />}
                        title={tr('Estrategia: SIMULATOR (Manual Operativo Exhaustivo)', 'Strategy: SIMULATOR (Exhaustive Operational Manual)')}
                        subtitle={tr(
                            'Documento de referencia total para operar Simulador en modo visual sin adivinar nada. Cada botón, selector, campo y comportamiento de runtime está explicado de forma explícita.',
                            'Complete reference to run Simulator in visual mode without guessing. Every button, selector, field, and runtime behavior is explained explicitly.',
                        )}
                    />

                    <Grid>
                        <InfoCard
                            title={tr('Qué sí hace', 'What it does')}
                            body={tr(
                                'Orquesta roleplay con memoria de sesión, pasos guionados, interrupciones globales y respuestas de IA cuando vos lo habilitás. Sirve para entrenamiento comportamental con reglas de negocio.',
                                'Orchestrates roleplay with session memory, scripted steps, global interrupts, and AI responses when enabled. It is for behavior training with business rules.',
                            )}
                        />
                        <InfoCard
                            title={tr('Qué no hace', 'What it does not do')}
                            body={tr(
                                'No es un motor de inspección con veredicto final tipo semáforo. Eso pertenece a DETECTOR. En SIMULATOR no existe plantilla nativa de veredicto final.',
                                'It is not an inspection engine with traffic-light final verdict. That belongs to DETECTOR. In SIMULATOR there is no native final-verdict template.',
                            )}
                        />
                    </Grid>

                    <Callout
                        title={tr('Regla estratégica recomendada', 'Recommended strategic rule')}
                        text={tr(
                            'Todo lo repetible, crítico o contractual va en pasos SCRIPTED y condiciones determinísticas. El modo LLM se usa para variación de lenguaje, no para decidir reglas duras.',
                            'Everything repeatable, critical, or contractual should be implemented as SCRIPTED steps with deterministic conditions. LLM mode should be used for language variation, not for hard-rule decisions.',
                        )}
                    />

                    <SectionHeading
                        icon={<Workflow className="h-6 w-6 text-primary" />}
                        title={tr('1) Flujo interno real del runtime (orden exacto)', '1) Real runtime flow (exact order)')}
                        subtitle={tr(
                            'Qué hace backend en cada turno de chat, en secuencia operacional.',
                            'What backend does on each chat turn, in operational sequence.',
                        )}
                    />

                    <Process
                        steps={[
                            tr('1) Carga la sesión y su metadata (incluye `flow_state` y `session_vars`).', '1) Loads session and metadata (including `flow_state` and `session_vars`).'),
                            tr('2) Si la sesión no tiene estado de flow, inicializa variables de sesión y estado base.', '2) If session has no flow state, initializes session variables and base state.'),
                            tr('3) Evalúa primero `global_triggers` (interrupciones globales), en el orden visual en que aparecen.', '3) Evaluates `global_triggers` first, in the visual order shown in editor.'),
                            tr('4) Si alguna interrupción global matchea, ejecuta ese paso y termina el turno.', '4) If any global interrupt matches, executes that step and ends the turn.'),
                            tr('5) Si no matchea ninguna global, evalúa `flow_steps` también en orden visual.', '5) If no global match, evaluates `flow_steps`, also in visual order.'),
                            tr('6) Un paso matchea solo cuando TODOS sus triggers configurados dan match (lógica AND).', '6) A step matches only when ALL its configured triggers match (AND logic).'),
                            tr('7) Si ningún paso matchea, se busca primer paso con trigger `DEFAULT` como red de seguridad.', '7) If no step matches, first step with `DEFAULT` trigger is used as fallback.'),
                            tr('8) Se ejecutan acciones del paso (`SET_VAR`, `INCREMENT`, `END_SESSION`), luego se calcula respuesta.', '8) Step actions run (`SET_VAR`, `INCREMENT`, `END_SESSION`), then response is produced.'),
                            tr('9) Si el paso es SCRIPTED, devuelve mensaje interpolado; si es LLM, arma contexto y llama al modelo.', '9) If step is SCRIPTED, returns interpolated message; if LLM, builds context and calls model.'),
                            tr('10) Sanitiza salida, guarda mensajes, persiste estado y deja trazas de trigger para auditoría interna.', '10) Sanitizes output, stores messages, persists state, and saves trigger traces for internal audit.'),
                        ]}
                    />

                    <SectionHeading
                        icon={<Settings2 className="h-6 w-6 text-primary" />}
                        title={tr('2) Mapa de pantalla: dónde está cada cosa en UI', '2) Screen map: where each control lives in UI')}
                        subtitle={tr(
                            'Ubicación exacta de paneles y su propósito operativo en estrategia SIMULATOR.',
                            'Exact location of panels and their operational purpose in SIMULATOR strategy.',
                        )}
                    />

                    <Rows
                        rows={[
                            {
                                field: tr('Mensaje de Introducción (`intro_message`)', 'Introduction Message (`intro_message`)'),
                                purpose: tr('Bloque colapsable independiente. Se envía al iniciar sesión; acepta placeholders `{variable}`.', 'Independent collapsible block. Sent at session start; supports `{variable}` placeholders.'),
                                example: tr('Hoy es {day_lock}. {name_lock} llega en su {vehicle_lock}.', 'Today is {day_lock}. {name_lock} arrives in {vehicle_lock}.'),
                            },
                            {
                                field: tr('Tarjeta "Simulador"', 'Simulator card'),
                                purpose: tr('Contiene el editor completo de variables, interrupciones globales y pasos.', 'Contains full editor for variables, global interrupts, and steps.'),
                                example: tr('Es el núcleo de diseño de comportamiento.', 'This is the behavior design core.'),
                            },
                            {
                                field: tr('Variables de sesión', 'Session variables'),
                                purpose: tr('Memoria viva de cada conversación. Todo placeholder `{x}` se toma de aquí.', 'Live memory of each conversation. Every `{x}` placeholder is read from here.'),
                                example: tr('archetype_lock, vehicle_lock, pedido_unit_lock', 'archetype_lock, vehicle_lock, pedido_unit_lock'),
                            },
                            {
                                field: tr('Interrupciones globales', 'Global interrupts'),
                                purpose: tr('Pasos evaluados en todos los turnos antes de `flow_steps` (comandos globales, reconducción, reset, cierre).', 'Steps evaluated on every turn before `flow_steps` (global commands, reconduction, reset, close).'),
                                example: tr('g_reset, g_reconduccion, g_post_cierre_repeat', 'g_reset, g_reconduccion, g_post_cierre_repeat'),
                            },
                            {
                                field: tr('Pasos del flujo', 'Flow steps'),
                                purpose: tr('Conversación principal del roleplay. Se activa cuando no intercepta una global.', 'Main roleplay conversation. Activates when no global interrupt intercepts.'),
                                example: tr('s_pedido_inicial, s_pago_confirmado, s_cierre_1', 's_pedido_inicial, s_pago_confirmado, s_cierre_1'),
                            },
                            {
                                field: tr('Disparadores de imagen', 'Image triggers'),
                                purpose: tr('Bloque separado fuera de FlowEditor. Agrega imágenes según regex en respuesta final del bot.', 'Separate block outside FlowEditor. Appends images based on regex in final bot response.'),
                                example: tr('Si el texto contiene "casco", anexa imagen de casco.', 'If text contains "helmet", appends helmet image.'),
                            },
                        ]}
                    />

                    <SectionHeading
                        icon={<Database className="h-6 w-6 text-primary" />}
                        title={tr('3) Variables de sesión: campo por campo y botón por botón', '3) Session variables: field-by-field and button-by-button')}
                        subtitle={tr(
                            'Cómo funciona exactamente cada control dentro de "Variables de sesión".',
                            'How every control inside "Session variables" works exactly.',
                        )}
                    />

                    <Rows
                        rows={[
                            {
                                field: tr('Mostrar/Ocultar variables', 'Show/Hide variables'),
                                purpose: tr('El encabezado abre/cierra la lista completa para edición.', 'Header expands/collapses full variable list for editing.'),
                                example: tr('Click en tarjeta Variables de sesión.', 'Click Variables card.'),
                            },
                            {
                                field: tr('Botón "Agregar variable"', 'Button "Add variable"'),
                                purpose: tr('Crea una variable nueva con nombre autogenerado (`varN`) y tipo `random` vacío.', 'Creates new variable with auto name (`varN`) and empty `random` type.'),
                                example: 'var1, var2, var3',
                            },
                            {
                                field: tr('Nombre', 'Name'),
                                purpose: tr('ID técnico de la variable. Se usa en placeholders `{nombre}` y en triggers/acciones.', 'Technical variable ID. Used in `{name}` placeholders and trigger/action conditions.'),
                                example: tr('payment_method_lock', 'payment_method_lock'),
                            },
                            {
                                field: tr('Tipo', 'Type'),
                                purpose: tr('Selector con 4 modos: `random`, `random_by`, `fixed`, `computed`.', 'Selector with 4 modes: `random`, `random_by`, `fixed`, `computed`.'),
                                example: tr('random_by para dependencias', 'random_by for dependencies'),
                            },
                            {
                                field: tr('Random: Opciones', 'Random: Options'),
                                purpose: tr('Lista separada por comas. El parser acepta comillas para textos con comas internas.', 'Comma-separated list. Parser supports quotes for values containing commas.'),
                                example: tr('"hola, equipo", chau, gracias', '"hello, team", bye, thanks'),
                            },
                            {
                                field: tr('Fixed: Valor', 'Fixed: Value'),
                                purpose: tr('Valor único constante para toda la sesión.', 'Single constant value for whole session.'),
                                example: tr('country = "AR"', 'country = "AR"'),
                            },
                            {
                                field: tr('Computed: Fórmula', 'Computed: Formula'),
                                purpose: tr('Soporta `random(min,max)` o referencia simple a otra variable. Si no reconoce la fórmula, guarda texto literal.', 'Supports `random(min,max)` or simple reference to another variable. If formula is not recognized, stores literal text.'),
                                example: tr('random(18,55)', 'random(18,55)'),
                            },
                            {
                                field: tr('Random_by: Variable fuente', 'Random_by: Source variable'),
                                purpose: tr('Define de qué variable depende esta. Excluye la propia variable para evitar autorreferencia directa.', 'Defines parent variable used as source. Excludes same variable to avoid direct self-reference.'),
                                example: tr('name_lock depende de archetype_lock', 'name_lock depends on archetype_lock'),
                            },
                            {
                                field: tr('Random_by: Mapeo de valores', 'Random_by: Value mapping'),
                                purpose: tr('Editor expandible: clave origen -> opciones destino. Si no hay clave para el valor origen, puede quedar `null`.', 'Expandable editor: source key -> destination options. If source value has no mapping key, result may stay `null`.'),
                                example: tr('Impaciente -> Abril, Aylén, Ian', 'Impaciente -> Abril, Aylén, Ian'),
                            },
                            {
                                field: tr('Ícono eliminar variable', 'Delete variable icon'),
                                purpose: tr('Borra la variable del diccionario `session_vars`.', 'Removes variable from `session_vars` dictionary.'),
                                example: tr('Usar con cuidado si está referenciada en pasos.', 'Use carefully if referenced in steps.'),
                            },
                            {
                                field: tr('Renombrar variable', 'Rename variable'),
                                purpose: tr('Cambia la clave en `session_vars`, pero NO reescribe automáticamente referencias en mensajes/triggers existentes.', 'Changes key in `session_vars`, but does NOT automatically rewrite existing references in messages/triggers.'),
                                example: tr('Si renombrás `vehiculo` a `vehicle_lock`, revisá placeholders manualmente.', 'If you rename `vehiculo` to `vehicle_lock`, manually review placeholders.'),
                            },
                        ]}
                    />

                    <Grid>
                        <InfoCard
                            title={tr('`random`', '`random`')}
                            body={tr(
                                'Elige un valor al iniciar sesión y lo conserva durante toda la conversación, salvo que una acción o actualización explícita lo modifique.',
                                'Picks a value at session start and keeps it for full conversation, unless an action or explicit update modifies it.',
                            )}
                        />
                        <InfoCard
                            title={tr('`random_by`', '`random_by`')}
                            body={tr(
                                'Resuelve dependencias. Ideal para nombre/arquetipo, combustible/motor, tono/familiaridad. Sin mapping válido, el valor puede quedar vacío.',
                                'Resolves dependencies. Ideal for name/archetype, fuel/engine, tone/familiarity. Without valid mapping, value may remain empty.',
                            )}
                        />
                        <InfoCard
                            title={tr('`fixed`', '`fixed`')}
                            body={tr(
                                'Útil para flags iniciales (`0`, `false`, `pendiente`) y constantes de escenario.',
                                'Useful for initial flags (`0`, `false`, `pending`) and scenario constants.',
                            )}
                        />
                        <InfoCard
                            title={tr('`computed`', '`computed`')}
                            body={tr(
                                'Bueno para rangos (edad, monto, litros). Recordá que no es un lenguaje completo de fórmulas; es intencionalmente acotado.',
                                'Good for ranges (age, amount, liters). Remember this is not a full formula language; it is intentionally limited.',
                            )}
                        />
                    </Grid>

                    <SectionHeading
                        icon={<Zap className="h-6 w-6 text-primary" />}
                        title={tr('4) Interrupciones globales (Global interrupts): anatomía completa', '4) Global interrupts: full anatomy')}
                        subtitle={tr(
                            'Cómo leer y configurar correctamente la zona "Interrupciones globales".',
                            'How to properly read and configure the "Global interrupts" area.',
                        )}
                    />

                    <Rows
                        rows={[
                            {
                                field: tr('Contador del título', 'Header counter'),
                                purpose: tr('Muestra cuántas interrupciones globales tenés activas.', 'Shows how many global interrupts are configured.'),
                                example: tr('Interrupciones globales (4)', 'Global interrupts (4)'),
                            },
                            {
                                field: tr('Agregar primera interrupción', 'Add first interrupt'),
                                purpose: tr('Botón visible cuando no hay ninguna. Crea paso global en modo SCRIPTED.', 'Button shown when list is empty. Creates SCRIPTED global step.'),
                                example: tr('ID autogenerado: global_paso_1', 'Auto ID: global_step_1'),
                            },
                            {
                                field: tr('Agregar interrupción global', 'Add global interrupt'),
                                purpose: tr('Botón visible cuando ya existe al menos una; agrega otra tarjeta.', 'Button shown when at least one exists; appends a new card.'),
                                example: tr('global_paso_2, global_paso_3', 'global_step_2, global_step_3'),
                            },
                            {
                                field: tr('Orden de tarjetas globales', 'Order of global cards'),
                                purpose: tr('Importa mucho: se evalúan de arriba a abajo. La primera que matchea corta el resto.', 'Very important: evaluated top to bottom. First matching one stops the rest.'),
                                example: tr('Poné reset/reconducción arriba, fallback abajo.', 'Place reset/reconduction on top, fallback below.'),
                            },
                            {
                                field: tr('Trigger `DEFAULT` global', 'Global `DEFAULT` trigger'),
                                purpose: tr('Puede interceptar todos los turnos si lo ubicás alto. El linter lo marca como warning para evitar bloqueos accidentales.', 'Can intercept every turn if placed high. Linter flags it as warning to prevent accidental hijack.'),
                                example: tr('`GLOBAL_DEFAULT_TRIGGER`', '`GLOBAL_DEFAULT_TRIGGER`'),
                            },
                            {
                                field: tr('Usos típicos correctos', 'Typical correct uses'),
                                purpose: tr('Reset de sesión, reconducción de foco, respuesta fija post-cierre, comandos de seguridad.', 'Session reset, focus reconduction, post-close fixed response, safety commands.'),
                                example: tr('g_reset, g_reconduccion_1, g_post_cierre_repeat', 'g_reset, g_reconduction_1, g_post_close_repeat'),
                            },
                        ]}
                    />

                    <SectionHeading
                        icon={<GitBranch className="h-6 w-6 text-primary" />}
                        title={tr('5) Pasos del flujo: anatomía visual completa de cada tarjeta', '5) Flow steps: full visual anatomy of each card')}
                        subtitle={tr(
                            'Cada control que aparece dentro de una tarjeta de paso, explicado sin atajos.',
                            'Every control shown inside a step card, explained with no shortcuts.',
                        )}
                    />

                    <Rows
                        rows={[
                            {
                                field: tr('Cabecera de paso', 'Step header'),
                                purpose: tr('Muestra `id`, modo, cantidad de triggers y acciones, y errores críticos asociados.', 'Shows `id`, mode, trigger/action count, and related critical issues.'),
                                example: tr('paso_cierre • 2 triggers • 1 acción', 'close_step • 2 triggers • 1 action'),
                            },
                            {
                                field: tr('Botones subir/bajar', 'Move up/down buttons'),
                                purpose: tr('Reordenan visualmente el paso. El orden impacta evaluación determinística.', 'Reorder step visually. Order impacts deterministic evaluation.'),
                                example: tr('Mover fallback al final.', 'Move fallback to bottom.'),
                            },
                            {
                                field: tr('Botón eliminar paso', 'Delete step button'),
                                purpose: tr('Quita la tarjeta completa del flujo.', 'Removes whole step card from flow.'),
                                example: tr('Eliminar paso obsoleto.', 'Remove obsolete step.'),
                            },
                            {
                                field: tr('ID del paso', 'Step ID'),
                                purpose: tr('Identificador técnico único usado por `AFTER_STEP`, `next_step`, trazas y debugging.', 'Unique technical identifier used by `AFTER_STEP`, `next_step`, traces, and debugging.'),
                                example: tr('s_pedido_inicial', 's_initial_request'),
                            },
                            {
                                field: tr('Tipo', 'Type'),
                                purpose: tr('`Guionado` (SCRIPTED) o `Con IA` (LLM). Cambia qué campo textual se usa para responder.', '`Scripted` (SCRIPTED) or `With AI` (LLM). Changes which text field drives response.'),
                                example: tr('SCRIPTED para copy fijo; LLM para conversación variable.', 'SCRIPTED for fixed copy; LLM for variable conversation.'),
                            },
                            {
                                field: tr('Siguiente paso (`next_step`)', 'Next step (`next_step`)'),
                                purpose: tr('Redirección explícita al finalizar este paso. Si queda vacío, mantiene paso actual como referencia interna.', 'Explicit redirect after executing step. If empty, keeps current step as internal reference.'),
                                example: tr('s_validacion_pago', 's_payment_validation'),
                            },
                            {
                                field: tr('Prioridad (paso)', 'Priority (step)'),
                                purpose: tr('En UI visual, número mayor = prioridad mayor SOLO en fallback ambiguo de `PHRASE_LIST`. No redefine el orden normal de pasos.', 'In visual UI, higher number = higher priority ONLY in ambiguous `PHRASE_LIST` fallback. It does not redefine normal step order.'),
                                example: tr('Usar 0 casi siempre; ajustar solo en ambigüedad.', 'Use 0 in most cases; tune only for ambiguity.'),
                            },
                            {
                                field: tr('Mensaje / Instrucciones IA', 'Message / AI context'),
                                purpose: tr('Si modo SCRIPTED usa `message`; si modo LLM usa `llm_context` como contexto adicional.', 'If SCRIPTED uses `message`; if LLM uses `llm_context` as additional context.'),
                                example: tr('SCRIPTED: "Pago con {payment_method_lock}."', 'SCRIPTED: "I pay with {payment_method_lock}."'),
                            },
                            {
                                field: tr('Interpolación `{variable}`', 'Interpolation `{variable}`'),
                                purpose: tr('Reemplaza placeholders por valores de sesión al ejecutar el paso.', 'Replaces placeholders with session values when step executes.'),
                                example: tr('{name_lock}, {vehicle_lock}, {archetype_micro_signal}', '{name_lock}, {vehicle_lock}, {archetype_micro_signal}'),
                            },
                        ]}
                    />

                    <SectionHeading
                        icon={<FileSearch className="h-6 w-6 text-primary" />}
                        title={tr('6) Bloque "RAG por paso" (solo modo LLM)', '6) "Per-step RAG" block (LLM mode only)')}
                        subtitle={tr(
                            'Qué hace cada selector dentro del panel de RAG embebido por paso.',
                            'What each selector does inside the per-step embedded RAG panel.',
                        )}
                    />

                    <Rows
                        rows={[
                            {
                                field: tr('Activado', 'Enabled'),
                                purpose: tr('Enciende o apaga RAG para ese paso LLM puntual.', 'Turns RAG on/off for that specific LLM step.'),
                                example: tr('Activar solo en pasos de validación documental.', 'Enable only in documentary validation steps.'),
                            },
                            {
                                field: tr('Propósito (`purpose`)', 'Purpose (`purpose`)'),
                                purpose: tr('Define intención del retrieval: contexto de respuesta, validar respuesta de usuario o evaluar conversación.', 'Defines retrieval intent: response context, validate user response, or evaluate conversation.'),
                                example: 'context | validate_user_response | evaluate_conversation',
                            },
                            {
                                field: tr('Estrategia (`strategy`)', 'Strategy (`strategy`)'),
                                purpose: tr('Método de consulta documental en backend wrapper.', 'Document-query strategy in backend wrapper.'),
                                example: 'metadata_first | similarity | hybrid',
                            },
                            {
                                field: tr('Estricto (`strict`)', 'Strict (`strict`)'),
                                purpose: tr('`Inherit` usa política del bot; `true/false` sobreescribe solo este paso.', '`Inherit` uses bot policy; `true/false` overrides only this step.'),
                                example: tr('Inherit para default global.', 'Inherit for global default.'),
                            },
                            {
                                field: tr('Top-K', 'Top-K'),
                                purpose: tr('Cantidad de resultados a recuperar para este paso.', 'Number of retrieval results for this step.'),
                                example: '4',
                            },
                            {
                                field: tr('Query Template', 'Query Template'),
                                purpose: tr('Consulta enviada al motor RAG. Acepta placeholders de variables de sesión.', 'Query sent to RAG engine. Supports session variable placeholders.'),
                                example: tr('política para {product_type}', 'policy for {product_type}'),
                            },
                            {
                                field: tr('Metadata Filters', 'Metadata Filters'),
                                purpose: tr('Pares clave/valor tipados (`string`, `number`, `boolean`) para filtrar documentos.', 'Typed key/value pairs (`string`, `number`, `boolean`) to filter documents.'),
                                example: tr('area=combustibles, nivel=2', 'area=fuels, level=2'),
                            },
                        ]}
                    />

                    <SectionHeading
                        icon={<Zap className="h-6 w-6 text-primary" />}
                        title={tr('7) Triggers: todos los tipos y todos los campos', '7) Triggers: every type and every field')}
                        subtitle={tr(
                            'Descripción exhaustiva de cada botón de trigger y su comportamiento real.',
                            'Exhaustive description of each trigger button and its real behavior.',
                        )}
                    />

                    <Rows
                        rows={[
                            {
                                field: tr('Botón + Inicio (`START`)', 'Button + Start (`START`)'),
                                purpose: tr('Match en arranque de sesión. No depende del texto del usuario.', 'Matches on session start. It does not depend on user text.'),
                                example: tr('Mensaje de bienvenida de práctica.', 'Practice welcome message.'),
                            },
                            {
                                field: tr('Botón + Texto (`REGEX`)', 'Button + Text (`REGEX`)'),
                                purpose: tr('Match por expresión regular contra mensaje del usuario.', 'Regex match against user message.'),
                                example: tr('`chau|hasta luego|nos vemos`', '`bye|see you`'),
                            },
                            {
                                field: tr('Botón + Lista (`PHRASE_LIST`)', 'Button + Phrase list (`PHRASE_LIST`)'),
                                purpose: tr('Matcher semántico robusto con exact, fuzzy y fallback de modelo si hay ambigüedad.', 'Robust semantic matcher with exact, fuzzy, and model fallback for ambiguity.'),
                                example: tr('intenciones de pago, cierre, app, reconducción', 'payment, close, app, reconduction intents'),
                            },
                            {
                                field: tr('Botón + Después (`AFTER_STEP`)', 'Button + After (`AFTER_STEP`)'),
                                purpose: tr('Exige que un paso específico haya ocurrido antes (secuencia lógica).', 'Requires a specific step to have happened before (logical sequence).'),
                                example: tr('Solo cerrar después de pago confirmado.', 'Close only after payment confirmation.'),
                            },
                            {
                                field: tr('Botón + Condición (`CONDITION`)', 'Button + Condition (`CONDITION`)'),
                                purpose: tr('Evalúa variable o `user_message` con operador textual.', 'Evaluates variable or `user_message` with textual operator.'),
                                example: tr('pedido_fijado equals 0', 'pedido_fijado equals 0'),
                            },
                            {
                                field: tr('Botón + Por defecto (`DEFAULT`)', 'Button + Default (`DEFAULT`)'),
                                purpose: tr('Siempre matchea; usar como último fallback.', 'Always matches; use as final fallback.'),
                                example: tr('"No te entendí, repitamos".', '"I did not understand, let us repeat."'),
                            },
                            {
                                field: tr('Prioridad de trigger', 'Trigger priority'),
                                purpose: tr('En visual: número mayor = prioridad mayor. Solo se usa para ordenar candidatos ambiguos de `PHRASE_LIST`.', 'In visual: higher number = higher priority. Used only to order ambiguous `PHRASE_LIST` candidates.'),
                                example: tr('No cambia orden normal de pasos.', 'Does not change normal step order.'),
                            },
                            {
                                field: tr('Aclaración crítica de motor', 'Critical engine clarification'),
                                purpose: tr('Dentro de un mismo paso, múltiples triggers configurados se evalúan en AND: todos deben cumplir.', 'Inside one step, multiple configured triggers are evaluated as AND: all must match.'),
                                example: tr('AFTER_STEP + PHRASE_LIST para cierres seguros.', 'AFTER_STEP + PHRASE_LIST for safe closures.'),
                            },
                        ]}
                    />

                    <SectionHeading
                        icon={<MessageSquare className="h-6 w-6 text-primary" />}
                        title={tr('8) PHRASE_LIST en profundidad (subcampos y uso correcto)', '8) PHRASE_LIST in depth (subfields and correct usage)')}
                        subtitle={tr(
                            'Subpanel más rico del editor: qué hace exactamente cada control.',
                            'Richest subpanel of editor: what each control does exactly.',
                        )}
                    />

                    <Rows
                        rows={[
                            {
                                field: tr('Frases que sí activan', 'Phrases that should activate'),
                                purpose: tr('Lista principal de intenciones objetivo. Separar por comas.', 'Main list of target intents. Comma-separated.'),
                                example: tr('cómo pagás, medio de pago, con qué pagás', 'how do you pay, payment method'),
                            },
                            {
                                field: tr('Frases que NO deben activar', 'Phrases that should NOT activate'),
                                purpose: tr('Negativos para evitar falsos positivos cuando aparece contexto parecido.', 'Negatives to avoid false positives with similar context.'),
                                example: tr('descuento, promo, reintegro', 'discount, promo, cashback'),
                            },
                            {
                                field: tr('Dónde buscar la frase', 'Where to search'),
                                purpose: tr('`full_message` revisa todo el turno; `tail_only` solo tramo final del mensaje.', '`full_message` scans full turn; `tail_only` scans message ending only.'),
                                example: tr('tail_only útil en detección de cierres.', 'tail_only useful for close detection.'),
                            },
                            {
                                field: tr('Tipo de coincidencia exacta', 'Exact matching type'),
                                purpose: tr('`token_boundary`, `suffix`, `substring` definen rigor del exact match.', '`token_boundary`, `suffix`, `substring` define exact-match strictness.'),
                                example: tr('token_boundary recomendado por defecto.', 'token_boundary recommended by default.'),
                            },
                            {
                                field: tr('Tolerancia a typos', 'Typo tolerance'),
                                purpose: tr('Activa/desactiva fuzzy matching.', 'Enables/disables fuzzy matching.'),
                                example: tr('On para lenguaje natural real.', 'On for real natural language.'),
                            },
                            {
                                field: tr('Si queda ambiguo, usar modelo', 'If ambiguous, use model'),
                                purpose: tr('`ambiguous_only` pide clasificación al modelo solo en zona gris.', '`ambiguous_only` requests model classification only in gray zone.'),
                                example: tr('Reduce errores en frases parecidas.', 'Reduces errors in similar phrases.'),
                            },
                            {
                                field: tr('Bloquear si parece pregunta', 'Block if message looks like a question'),
                                purpose: tr('Guardrail para evitar activar intención de cierre cuando usuario realmente está preguntando.', 'Guardrail to avoid triggering close intent when user is actually asking.'),
                                example: tr('Evita cierre si termina en "?"', 'Avoids close when ending with "?"'),
                            },
                            {
                                field: tr('Bloquear si continúa la charla', 'Block if user continues conversation'),
                                purpose: tr('Guardrail lexical para frenar matches de cierre si aparece continuación tipo "pero", "además".', 'Lexical guardrail to prevent close matches when continuation words appear.'),
                                example: tr('Bueno gracias, pero una cosa más...', 'Thanks, but one more thing...'),
                            },
                            {
                                field: tr('Nombre interno (intent_name)', 'Internal name (intent_name)'),
                                purpose: tr('Etiqueta técnica para telemetría y diagnóstico de fallback.', 'Technical label for telemetry and fallback diagnostics.'),
                                example: tr('intent_pago_medio', 'intent_payment_method'),
                            },
                        ]}
                    />

                    <SectionHeading
                        icon={<Wrench className="h-6 w-6 text-primary" />}
                        title={tr('9) Acciones del paso: END_SESSION, SET_VAR, INCREMENT', '9) Step actions: END_SESSION, SET_VAR, INCREMENT')}
                        subtitle={tr(
                            'Qué hace cada acción, cómo cargarla y qué pasa en runtime.',
                            'What each action does, how to set it, and runtime behavior.',
                        )}
                    />

                    <Rows
                        rows={[
                            {
                                field: tr('Botón + Terminar', 'Button + End'),
                                purpose: tr('Agrega acción `END_SESSION`. Cierra sesión al ejecutar el paso.', 'Adds `END_SESSION` action. Closes session when step executes.'),
                                example: tr('Post-cierre para bloquear nuevos turnos.', 'Post-close to block further turns.'),
                            },
                            {
                                field: tr('Botón + Definir variable', 'Button + Set variable'),
                                purpose: tr('Agrega acción `SET_VAR` editable: variable, tipo de valor y valor.', 'Adds editable `SET_VAR`: variable, value type, and value.'),
                                example: tr('SET_VAR pago_ok = 1', 'SET_VAR pago_ok = 1'),
                            },
                            {
                                field: tr('Botón + Incrementar', 'Button + Increment'),
                                purpose: tr('Agrega acción `INCREMENT`: suma numérica acumulativa sobre variable objetivo.', 'Adds `INCREMENT`: cumulative numeric sum on target variable.'),
                                example: tr('INCREMENT app_q_count por 1', 'INCREMENT app_q_count by 1'),
                            },
                            {
                                field: tr('SET_VAR: tipo', 'SET_VAR: type'),
                                purpose: tr('Selector `string | number | boolean | null` para persistir tipo correcto.', 'Selector `string | number | boolean | null` to persist proper type.'),
                                example: tr('number -> 0 / 1 / 2', 'number -> 0 / 1 / 2'),
                            },
                            {
                                field: tr('INCREMENT: conversión numérica', 'INCREMENT: numeric coercion'),
                                purpose: tr('Si el valor actual no es número, runtime lo convierte a número (fallback 0) antes de sumar.', 'If current value is not numeric, runtime coerces to number (fallback 0) before summing.'),
                                example: tr('"2" + 1 => 3', '"2" + 1 => 3'),
                            },
                            {
                                field: tr('Variable vacía en acción', 'Empty variable in action'),
                                purpose: tr('Si `var` queda vacía, runtime ignora esa acción.', 'If `var` stays empty, runtime ignores that action.'),
                                example: tr('Siempre completar campo Variable.', 'Always fill Variable field.'),
                            },
                        ]}
                    />

                    <SectionHeading
                        icon={<Brain className="h-6 w-6 text-primary" />}
                        title={tr('10) Modo SCRIPTED vs Modo LLM: diferencias operativas', '10) SCRIPTED mode vs LLM mode: operational differences')}
                        subtitle={tr(
                            'Cuándo conviene cada modo y qué garantías da cada uno.',
                            'When to use each mode and what guarantees each one provides.',
                        )}
                    />

                    <Rows
                        rows={[
                            {
                                field: 'SCRIPTED',
                                purpose: tr('Respuesta fija y determinística con placeholders. Máxima previsibilidad para copy contractual.', 'Fixed deterministic reply with placeholders. Maximum predictability for contractual copy.'),
                                example: tr('"Pago con {payment_method_lock}."', '"I pay with {payment_method_lock}."'),
                            },
                            {
                                field: 'LLM',
                                purpose: tr('Respuesta generativa con `llm_context` + instrucciones globales + variables de sesión. Más naturalidad, menos rigidez.', 'Generative reply using `llm_context` + global instructions + session vars. More naturalness, less rigidity.'),
                                example: tr('Roleplay abierto con guardrails.', 'Open roleplay with guardrails.'),
                            },
                            {
                                field: tr('Persistencia de variables en LLM', 'Variable persistence in LLM'),
                                purpose: tr('Runtime inyecta contexto de variables y acepta actualizaciones controladas para mantener coherencia de sesión.', 'Runtime injects variable context and accepts controlled updates to maintain session coherence.'),
                                example: tr('Arquetipo permanece estable salvo cambio explícito.', 'Archetype remains stable unless explicitly changed.'),
                            },
                            {
                                field: tr('Híbrido recomendado', 'Recommended hybrid'),
                                purpose: tr('Pasos críticos en SCRIPTED y puentes conversacionales en LLM.', 'Critical steps in SCRIPTED and conversational bridges in LLM.'),
                                example: tr('Inicio, pagos y cierre scripted; negociación en LLM.', 'Start, payments, and close scripted; negotiation in LLM.'),
                            },
                        ]}
                    />

                    <SectionHeading
                        icon={<ShieldCheck className="h-6 w-6 text-primary" />}
                        title={tr('11) Prioridades y orden: qué decide realmente el motor', '11) Priorities and order: what the engine really decides')}
                        subtitle={tr(
                            'Evita una confusión común: prioridad no reemplaza orden visual en matching determinístico.',
                            'Avoid a common confusion: priority does not replace visual order in deterministic matching.',
                        )}
                    />

                    <Rows
                        rows={[
                            {
                                field: tr('Orden de pasos', 'Step order'),
                                purpose: tr('Determinístico: el primer paso que matchea gana.', 'Deterministic: first matching step wins.'),
                                example: tr('Colocar casos específicos arriba de genéricos.', 'Place specific cases above generic ones.'),
                            },
                            {
                                field: tr('Prioridad de paso/trigger', 'Step/trigger priority'),
                                purpose: tr('Afecta solo ranking en fallback ambiguo de `PHRASE_LIST` con modelo.', 'Affects only ranking in ambiguous `PHRASE_LIST` model fallback.'),
                                example: tr('No cambia resultado de `REGEX` claro.', 'Does not change clear `REGEX` outcome.'),
                            },
                            {
                                field: tr('DEFAULT mal ubicado', 'Misplaced DEFAULT'),
                                purpose: tr('Si lo ponés arriba, captura antes y deja sin chance a pasos más específicos.', 'If placed high, captures earlier and blocks more specific steps.'),
                                example: tr('Siempre dejar DEFAULT al final.', 'Always keep DEFAULT at bottom.'),
                            },
                        ]}
                    />

                    <SectionHeading
                        icon={<FileText className="h-6 w-6 text-primary" />}
                        title={tr('12) Errores y validaciones del linter (críticos y warnings)', '12) Linter validations (critical and warnings)')}
                        subtitle={tr(
                            'Qué revisa automáticamente el editor y cómo interpretar cada señal.',
                            'What editor checks automatically and how to interpret each signal.',
                        )}
                    />

                    <Rows
                        rows={[
                            { field: 'STEP_ID_EMPTY (critical)', purpose: tr('Paso sin ID.', 'Step without ID.'), example: tr('Bloquea publicación.', 'Blocks publish.') },
                            { field: 'STEP_ID_DUPLICATE (critical)', purpose: tr('ID de paso repetido.', 'Duplicated step ID.'), example: tr('Bloquea publicación.', 'Blocks publish.') },
                            { field: 'NEXT_STEP_UNKNOWN (critical)', purpose: tr('`next_step` apunta a ID inexistente.', '`next_step` points to unknown ID.'), example: tr('Bloquea publicación.', 'Blocks publish.') },
                            { field: 'REGEX_INVALID (critical)', purpose: tr('Regex inválida, demasiado larga o insegura.', 'Regex invalid, too long, or unsafe.'), example: tr('Bloquea publicación.', 'Blocks publish.') },
                            { field: 'AFTER_STEP_UNKNOWN (critical)', purpose: tr('Trigger `AFTER_STEP` apunta a paso inexistente.', '`AFTER_STEP` trigger points to unknown step.'), example: tr('Bloquea publicación.', 'Blocks publish.') },
                            { field: 'STEP_WITHOUT_TRIGGERS (warning)', purpose: tr('Paso sin triggers accesibles.', 'Step without accessible triggers.'), example: tr('No bloquea guardar.', 'Does not block save.') },
                            { field: 'TRIGGER_DUPLICATE (warning)', purpose: tr('Trigger repetido dentro del mismo paso.', 'Duplicated trigger within same step.'), example: tr('Revisar para evitar redundancia.', 'Review to avoid redundancy.') },
                            { field: 'REGEX_EMPTY (warning)', purpose: tr('Trigger regex sin patrón.', 'Regex trigger with empty pattern.'), example: tr('No bloquea guardar.', 'Does not block save.') },
                            { field: 'REGEX_RISKY (warning)', purpose: tr('Regex potencialmente costosa.', 'Potentially expensive regex.'), example: tr('Optimizar patrón.', 'Optimize pattern.') },
                            { field: 'PHRASE_LIST_EMPTY (warning)', purpose: tr('`PHRASE_LIST` sin frases positivas.', '`PHRASE_LIST` without positive phrases.'), example: tr('No disparará intención útil.', 'Will not trigger useful intent.') },
                            { field: 'GLOBAL_DEFAULT_TRIGGER (warning)', purpose: tr('DEFAULT en globals puede interceptar todo.', 'DEFAULT in globals can intercept everything.'), example: tr('Ubicar al final.', 'Place at bottom.') },
                            { field: 'TEMPLATE_VAR_UNDEFINED (warning)', purpose: tr('Mensaje usa `{variable}` no definida.', 'Message uses undefined `{variable}`.'), example: tr('Se mostrará literal sin reemplazo.', 'Will be shown literally without interpolation.') },
                            { field: 'NEXT_STEP_CYCLE (warning)', purpose: tr('Ciclo detectado en `next_step`.', 'Cycle detected in `next_step`.'), example: tr('Puede generar loop conversacional.', 'May generate conversational loop.') },
                        ]}
                    />

                    <SectionHeading
                        icon={<FileSearch className="h-6 w-6 text-primary" />}
                        title={tr('13) Disparadores de imagen (panel separado): detalle completo', '13) Image triggers (separate panel): complete detail')}
                        subtitle={tr(
                            'Cómo configurar imágenes automáticas al final de la respuesta del bot.',
                            'How to configure automatic images appended to bot responses.',
                        )}
                    />

                    <Rows
                        rows={[
                            {
                                field: tr('Botón "Agregar disparador"', 'Button "Add trigger"'),
                                purpose: tr('Agrega fila con `pattern`, `image_url`, `caption`.', 'Adds row with `pattern`, `image_url`, `caption`.'),
                                example: tr('Se pueden cargar múltiples filas.', 'Multiple rows allowed.'),
                            },
                            {
                                field: 'pattern',
                                purpose: tr('Regex aplicada al texto de salida final del bot.', 'Regex applied to final bot output text.'),
                                example: tr('casco|protección', 'helmet|protection'),
                            },
                            {
                                field: 'image_url',
                                purpose: tr('URL de imagen a anexar cuando el patrón matchee.', 'Image URL appended when pattern matches.'),
                                example: 'https://.../casco.png',
                            },
                            {
                                field: 'caption',
                                purpose: tr('Texto alternativo de markdown para la imagen.', 'Markdown alt text for appended image.'),
                                example: tr('Referencia visual de casco', 'Helmet visual reference'),
                            },
                            {
                                field: tr('Regla de guardado', 'Save rule'),
                                purpose: tr('Filas totalmente vacías se limpian; filas parciales se conservan para corrección y se marcan en QA/test.', 'Fully empty rows are removed; partial rows are kept for correction and flagged in QA/test.'),
                                example: tr('Completar pattern + image_url para que aplique.', 'Fill pattern + image_url for effect.'),
                            },
                        ]}
                    />

                    <SectionHeading
                        icon={<Code2 className="h-6 w-6 text-primary" />}
                        title={tr('14) Campos soportados por motor pero no expuestos en este visual', '14) Engine-supported fields not exposed in this visual')}
                        subtitle={tr(
                            'Para casos avanzados podés usar Pro Mode/JSON y luego volver al visual.',
                            'For advanced cases you can use Pro Mode/JSON and return to visual mode later.',
                        )}
                    />

                    <Rows
                        rows={[
                            {
                                field: tr('CONDITION operadores avanzados', 'CONDITION advanced operators'),
                                purpose: tr('Motor soporta `not_equals`, `gt`, `lt`, pero este selector visual muestra solo operadores textuales principales.', 'Engine supports `not_equals`, `gt`, `lt`, but visual selector currently shows only main textual operators.'),
                                example: tr('Usar Pro Mode para comparación numérica estricta.', 'Use Pro Mode for strict numeric comparisons.'),
                            },
                            {
                                field: tr('PHRASE_LIST fuzzy fino', 'PHRASE_LIST fine fuzzy tuning'),
                                purpose: tr('Existen parámetros como `min_similarity`, `max_edits_*`, `gray_zone_min_similarity` en schema/runtime; UI visual no edita todos explícitamente.', 'Parameters like `min_similarity`, `max_edits_*`, `gray_zone_min_similarity` exist in schema/runtime; visual UI does not expose all explicitly.'),
                                example: tr('Ajustes finos vía Pro Mode.', 'Fine tuning via Pro Mode.'),
                            },
                            {
                                field: tr('PHRASE_LIST guardrail de estado', 'PHRASE_LIST flow-state guardrail'),
                                purpose: tr('`allow_only_in_flow_states` existe en runtime para restringir detección por estado actual.', '`allow_only_in_flow_states` exists in runtime to restrict detection by current flow state.'),
                                example: tr('Útil para intents permitidos solo en ciertos tramos.', 'Useful for intents allowed only in specific segments.'),
                            },
                            {
                                field: tr('REGEX flags personalizadas', 'Custom REGEX flags'),
                                purpose: tr('Schema soporta `flags`; visual inicializa en `i` y no muestra input dedicado.', 'Schema supports `flags`; visual initializes with `i` and has no dedicated input.'),
                                example: tr('`m`, `u`, etc. vía Pro Mode.', '`m`, `u`, etc. via Pro Mode.'),
                            },
                        ]}
                    />

                    <SectionHeading
                        icon={<ListChecks className="h-6 w-6 text-primary" />}
                        title={tr('15) Receta operativa recomendada para configurar bien desde cero', '15) Recommended operational recipe to configure correctly from scratch')}
                        subtitle={tr(
                            'Secuencia sugerida para minimizar errores de diseño y acelerar debugging.',
                            'Suggested sequence to minimize design errors and speed up debugging.',
                        )}
                    />

                    <Process
                        steps={[
                            tr('1) Definí objetivo pedagógico de la simulación en 1 frase (qué habilidad entrenás).', '1) Define pedagogical objective in one sentence (which skill is trained).'),
                            tr('2) Diseñá variables mínimas de contexto (rol, arquetipo, producto, estado).', '2) Design minimum context variables (role, archetype, product, state).'),
                            tr('3) Configurá intro_message interpolado con esas variables.', '3) Configure interpolated intro_message with those variables.'),
                            tr('4) Cargá interrupciones globales críticas (reset, reconducción, post-cierre).', '4) Configure critical global interrupts (reset, reconduction, post-close).'),
                            tr('5) Construí pasos principales en SCRIPTED para copy fijo y evaluable.', '5) Build main SCRIPTED steps for fixed auditable copy.'),
                            tr('6) Agregá pasos LLM solo donde necesitás variación natural.', '6) Add LLM steps only where natural variation is required.'),
                            tr('7) Conectá estado con acciones (`SET_VAR` / `INCREMENT`) para evitar lógica implícita.', '7) Connect state with actions (`SET_VAR` / `INCREMENT`) to avoid implicit logic.'),
                            tr('8) Revisá panel de errores críticos y warnings del linter antes de publicar.', '8) Review linter critical/warning panel before publishing.'),
                            tr('9) Probá casos felices + casos borde (off-topic, cierre prematuro, ambigüedad).', '9) Test happy paths + edge cases (off-topic, premature close, ambiguity).'),
                            tr('10) Publicá en staging, corré QA Lab y recién después promové a producción.', '10) Publish to staging, run QA Lab, then promote to production.'),
                        ]}
                    />

                    <SectionHeading
                        icon={<Settings2 className="h-6 w-6 text-primary" />}
                        title={tr('16) Controles fuera del bloque "Simulador" que igual impactan la estrategia', '16) Controls outside the "Simulator" block that still impact the strategy')}
                        subtitle={tr(
                            'Estos campos están en tarjetas superiores del editor general, pero afectan directamente cómo se comporta un bot SIMULATOR.',
                            'These fields live in upper cards of the general editor, but directly affect how a SIMULATOR bot behaves.',
                        )}
                    />

                    <Rows
                        rows={[
                            {
                                field: tr('Instrucciones del bot (`instructions_prefix`)', 'Bot instructions (`instructions_prefix`)'),
                                purpose: tr('Es la capa conductual base que siempre acompaña a los pasos del flow. Si esta capa contradice el flujo, verás inconsistencias de estilo o rol.', 'This is the base behavioral layer always sent with flow steps. If this layer contradicts the flow, you will see style or role inconsistencies.'),
                                example: tr('Regla sana: lo crítico/determinístico en pasos; tono y matiz en instrucciones.', 'Healthy rule: critical/deterministic behavior in steps; tone and nuance in instructions.'),
                            },
                            {
                                field: tr('Modelo (`llm_model` / orquestación)', 'Model (`llm_model` / orchestration)'),
                                purpose: tr('Define qué modelo resuelve pasos LLM, fallback y partes semánticas. Cambiar modelo cambia costos, latencia y variabilidad de lenguaje.', 'Defines which model solves LLM steps, fallback, and semantic parts. Changing model affects cost, latency, and wording variability.'),
                                example: tr('Si buscás estabilidad máxima, reducís pasos LLM y mantenés más SCRIPTED.', 'If you need maximum stability, reduce LLM steps and keep more SCRIPTED steps.'),
                            },
                            {
                                field: tr('Prompt ID (`pmpt_*`) y versión', 'Prompt ID (`pmpt_*`) and version'),
                                purpose: tr('Si usás prompt gestionado, el comportamiento puede cambiar al variar la versión aunque el flow no cambie.', 'If you use a managed prompt, behavior can change when version changes even if the flow stays the same.'),
                                example: tr('Cuando actualices versión, hacé prueba completa inicio -> cierre.', 'When updating version, run a full start -> close test.'),
                            },
                            {
                                field: tr('RAG global (`rag_config`)', 'Global RAG (`rag_config`)'),
                                purpose: tr('Afecta cómo se busca evidencia cuando un paso LLM pide contexto documental. Se combina con RAG por paso (si lo activaste).', 'Affects evidence retrieval when an LLM step requests documentation context. It combines with per-step RAG (if enabled).'),
                                example: tr('Modo never + pasos SCRIPTED = simulador más determinístico.', 'Mode never + SCRIPTED steps = more deterministic simulator.'),
                            },
                            {
                                field: tr('Capacidades de chat (`chat_features`)', 'Chat capabilities (`chat_features`)'),
                                purpose: tr('Habilita/deshabilita voz de entrada, voz de salida e imágenes. No cambia la lógica del flow, pero sí los canales de interacción.', 'Enables/disables voice input, voice output, and image upload. It does not change flow logic, but changes interaction channels.'),
                                example: tr('Si activás imagen, agregá reglas para interpretar o ignorar imágenes de forma segura.', 'If image upload is enabled, add rules to safely interpret or ignore images.'),
                            },
                            {
                                field: tr('Mensaje inicial (`intro_message`)', 'Initial message (`intro_message`)'),
                                purpose: tr('Se envía al abrir chat. Puede usar `{variables}` ya inicializadas. Es parte clave de consistencia en simulaciones.', 'Sent when chat opens. It can use pre-initialized `{variables}`. It is a key consistency anchor for simulations.'),
                                example: tr('Hoy es {day_lock}. {name_lock} llega en su {vehicle_lock}.', 'Today is {day_lock}. {name_lock} arrives in {vehicle_lock}.'),
                            },
                            {
                                field: tr('Evaluador asignado (`evaluator_bot_id`)', 'Assigned evaluator (`evaluator_bot_id`)'),
                                purpose: tr('No cambia lo que el simulador dice, pero sí cómo se evalúa luego la sesión en resultados/score.', 'Does not change simulator responses, but changes how session quality is evaluated later in scoring/results.'),
                                example: tr('Mismo simulador + otro evaluador => distinto puntaje posible.', 'Same simulator + different evaluator => potentially different score.'),
                            },
                        ]}
                    />

                    <SectionHeading
                        icon={<Wrench className="h-6 w-6 text-primary" />}
                        title={tr('17) Defaults automáticos del editor (lo que se crea si tocás "Agregar")', '17) Editor auto-defaults (what gets created when you click "Add")')}
                        subtitle={tr(
                            'Referencia exacta de valores iniciales que el visual crea por vos, para que entiendas por qué aparece cada cosa al nacer.',
                            'Exact reference of initial values created by visual editor, so you understand why each new item starts that way.',
                        )}
                    />

                    <Rows
                        rows={[
                            {
                                field: tr('Agregar paso (flujo principal)', 'Add step (main flow)'),
                                purpose: tr('Crea `id=pasoN` (o `stepN`), `mode=SCRIPTED`, `priority=0`, `triggers=[]`, `message=""`, `next_step=""`.', 'Creates `id=pasoN` (or `stepN`), `mode=SCRIPTED`, `priority=0`, `triggers=[]`, `message=""`, `next_step=""`.'),
                                example: tr('Conviene renombrar ID de inmediato para evitar confusión futura.', 'Rename ID immediately to avoid future confusion.'),
                            },
                            {
                                field: tr('Agregar interrupción global', 'Add global interrupt'),
                                purpose: tr('Crea `id=global_paso_N` (o `global_step_N`) con misma estructura base del paso común.', 'Creates `id=global_paso_N` (or `global_step_N`) with same base structure as regular steps.'),
                                example: tr('Primera global recomendada: `g_reset`.', 'Recommended first global: `g_reset`.'),
                            },
                            {
                                field: tr('Agregar variable', 'Add variable'),
                                purpose: tr('Crea `varN` con `type=random` y `options=[]`.', 'Creates `varN` with `type=random` and `options=[]`.'),
                                example: tr('Si no cargás opciones, esa variable puede quedar vacía/null.', 'If options stay empty, that variable can become empty/null.'),
                            },
                            {
                                field: tr('Trigger REGEX nuevo', 'New REGEX trigger'),
                                purpose: tr('Nace con `pattern=""` y `flags="i"` (case-insensitive).', 'Starts with `pattern=""` and `flags="i"` (case-insensitive).'),
                                example: tr('Si no completás pattern, no matchea y el linter avisa.', 'If pattern remains empty, it will not match and linter warns.'),
                            },
                            {
                                field: tr('Trigger CONDITION nuevo', 'New CONDITION trigger'),
                                purpose: tr('Nace con `var=user_message`, `op=contains`, `value=""`.', 'Starts with `var=user_message`, `op=contains`, `value=""`.'),
                                example: tr('Si dejás value vacío, no es condición útil.', 'If value stays empty, condition is not useful.'),
                            },
                            {
                                field: tr('Trigger PHRASE_LIST nuevo', 'New PHRASE_LIST trigger'),
                                purpose: tr('Nace con defaults completos: scope full_message, end_window_chars 90, end_window_tokens 10, fuzzy on, fallback off, confidence 0.75.', 'Starts with full defaults: scope full_message, end_window_chars 90, end_window_tokens 10, fuzzy on, fallback off, confidence 0.75.'),
                                example: tr('Siempre completar frases positivas y revisar negativos.', 'Always fill positive phrases and review negatives.'),
                            },
                            {
                                field: tr('Acción SET_VAR nueva', 'New SET_VAR action'),
                                purpose: tr('Nace con `var=""` y `value=""`; si no completás `var`, runtime la ignora.', 'Starts with `var=""` and `value=""`; if `var` is left empty, runtime ignores it.'),
                                example: tr('Primero elegí variable, después tipo, después valor.', 'Select variable first, then type, then value.'),
                            },
                            {
                                field: tr('Acción INCREMENT nueva', 'New INCREMENT action'),
                                purpose: tr('Nace con `var=""` y `value=1`; si `var` vacío, no suma nada.', 'Starts with `var=""` and `value=1`; if `var` is empty, it increments nothing.'),
                                example: tr('Patrón típico: `retry_count += 1`.', 'Typical pattern: `retry_count += 1`.'),
                            },
                        ]}
                    />

                    <SectionHeading
                        icon={<MessageSquare className="h-6 w-6 text-primary" />}
                        title={tr('18) PHRASE_LIST: parámetros técnicos completos (visibles + no visibles)', '18) PHRASE_LIST: complete technical parameters (visible + non-visible)')}
                        subtitle={tr(
                            'Esta es la parte más sensible del matching semántico. Acá tenés defaults, significado y efectos colaterales.',
                            'This is the most sensitive part of semantic matching. Here are defaults, meaning, and side effects.',
                        )}
                    />

                    <Rows
                        rows={[
                            {
                                field: tr('`scope.mode`', '`scope.mode`'),
                                purpose: tr('`full_message` evalúa todo el texto; `tail_only` evalúa cola final combinando ventana de caracteres y tokens.', '`full_message` scans whole text; `tail_only` scans ending slice combining char and token windows.'),
                                example: tr('`tail_only` ayuda a cierres tipo "gracias, hasta luego".', '`tail_only` helps with closing intents like "thanks, bye".'),
                            },
                            {
                                field: tr('`scope.end_window_chars` / `scope.end_window_tokens`', '`scope.end_window_chars` / `scope.end_window_tokens`'),
                                purpose: tr('Defaults 90 chars y 10 tokens. En `tail_only`, ambos recortes se calculan y se usa el tramo más corto al final.', 'Defaults are 90 chars and 10 tokens. In `tail_only`, both trims are computed and the ending slice is used.'),
                                example: tr('Si te queda corta la cola, subí chars/tokens.', 'If ending slice is too short, increase chars/tokens.'),
                            },
                            {
                                field: tr('`exact_mode`', '`exact_mode`'),
                                purpose: tr('`token_boundary` (recomendado) exige borde de palabra; `suffix` exige final; `substring` es más permisivo.', '`token_boundary` (recommended) enforces token boundaries; `suffix` enforces ending; `substring` is more permissive.'),
                                example: tr('Para evitar falsos positivos, empezar por token_boundary.', 'To avoid false positives, start with token_boundary.'),
                            },
                            {
                                field: tr('`fuzzy.enabled` y umbrales', '`fuzzy.enabled` and thresholds'),
                                purpose: tr('Defaults: enabled=true, min_similarity=0.84, gray_zone_min_similarity=0.7, edits cortos/medios/largos = 1/2/3.', 'Defaults: enabled=true, min_similarity=0.84, gray_zone_min_similarity=0.7, short/medium/long edits = 1/2/3.'),
                                example: tr('Si hay mucho typo real, mantener fuzzy on.', 'If real-world typo rate is high, keep fuzzy on.'),
                            },
                            {
                                field: tr('`negative_phrases`', '`negative_phrases`'),
                                purpose: tr('Si hay match exacto negativo, bloquea el trigger aunque haya frase positiva parecida.', 'If a negative phrase exact-matches, trigger is blocked even if a positive phrase is similar.'),
                                example: tr('Intent pago: negativo "promo, descuento, reintegro".', 'Payment intent: negatives "promo, discount, cashback".'),
                            },
                            {
                                field: tr('`guardrails.block_on_question`', '`guardrails.block_on_question`'),
                                purpose: tr('Si está activo y detecta signo/patrón de pregunta, bloquea match para evitar cortes prematuros.', 'If enabled and a question pattern is detected, match is blocked to avoid premature transitions.'),
                                example: tr('Evita cerrar cuando usuario dice "¿algo más?".', 'Prevents close when user says "anything else?".'),
                            },
                            {
                                field: tr('`guardrails.block_on_continuation_words`', '`guardrails.block_on_continuation_words`'),
                                purpose: tr('Si está activo y hay continuadores (pero, además, también...), bloquea match.', 'If enabled and continuation words exist (but, also...), match is blocked.'),
                                example: tr('Evita cierre en "gracias, pero una cosa más".', 'Avoids close on "thanks, but one more thing".'),
                            },
                            {
                                field: tr('`guardrails.continuation_words`', '`guardrails.continuation_words`'),
                                purpose: tr('Tiene lista default interna aunque no la veas en visual. Se puede ajustar por Pro/JSON.', 'Has an internal default list even if not visible in visual editor. It can be tuned in Pro/JSON.'),
                                example: tr('Incluye "pero", "además", "otra cosa", "también".', 'Includes "but", "also", "another thing".'),
                            },
                            {
                                field: tr('`guardrails.allow_only_in_flow_states`', '`guardrails.allow_only_in_flow_states`'),
                                purpose: tr('Restringe el trigger a estados concretos de flujo. Disponible en runtime/schema; no se edita directo en visual.', 'Restricts trigger to specific flow states. Available in runtime/schema; not directly editable in visual mode.'),
                                example: tr('Útil para intents válidos solo post-pago.', 'Useful for intents valid only post-payment.'),
                            },
                            {
                                field: tr('`model_fallback.mode` + `min_confidence`', '`model_fallback.mode` + `min_confidence`'),
                                purpose: tr('Con `ambiguous_only`, el modelo solo decide cuando fuzzy queda en zona gris. Si confidence < umbral, no activa.', 'With `ambiguous_only`, model decides only when fuzzy is ambiguous. If confidence < threshold, it does not activate.'),
                                example: tr('Default confidence mínima = 0.75.', 'Default minimum confidence = 0.75.'),
                            },
                        ]}
                    />

                    <SectionHeading
                        icon={<Brain className="h-6 w-6 text-primary" />}
                        title={tr('19) Persistencia de variables en conversación larga (consistencia real)', '19) Variable persistence in long conversations (real consistency)')}
                        subtitle={tr(
                            'Cómo se mantiene estable el estado durante todo el chat, incluso combinando pasos SCRIPTED y LLM.',
                            'How state stays stable across the whole chat, even when combining SCRIPTED and LLM steps.',
                        )}
                    />

                    <Rows
                        rows={[
                            {
                                field: tr('Estado oficial', 'Official state'),
                                purpose: tr('El estado vivo está en `flow_state.vars` y se sincroniza con `session_vars` en metadata.', 'Live state is in `flow_state.vars` and is synchronized with `session_vars` in metadata.'),
                                example: tr('Si cambias un lock, debe verse igual en ambos snapshots.', 'If you change a lock, it should match in both snapshots.'),
                            },
                            {
                                field: tr('Paso SCRIPTED', 'SCRIPTED step'),
                                purpose: tr('Lee variables actuales, interpola `{var}`, ejecuta acciones y persiste nuevo estado.', 'Reads current variables, interpolates `{var}`, executes actions, and persists new state.'),
                                example: tr('`SET_VAR arquetipo=Decidido` impacta mensajes siguientes.', '`SET_VAR archetype=Decidido` affects following turns.'),
                            },
                            {
                                field: tr('Paso LLM', 'LLM step'),
                                purpose: tr('Recibe contexto + variables y puede devolver updates de variables con bloque técnico oculto de actualización.', 'Receives context + variables and can return variable updates with hidden technical update block.'),
                                example: tr('Tag interna: `<SESSION_VARS_UPDATE>{"k":"v"}</SESSION_VARS_UPDATE>`.', 'Internal tag: `<SESSION_VARS_UPDATE>{"k":"v"}</SESSION_VARS_UPDATE>`.'),
                            },
                            {
                                field: tr('Sanitización y salida', 'Sanitization and output'),
                                purpose: tr('La respuesta final pasa por sanitización y disparadores de imagen para mantener salida segura y consistente.', 'Final output goes through sanitization and image triggers for safe, consistent rendering.'),
                                example: tr('Aplicado también en respuestas SCRIPTED del flow principal.', 'Also applied to SCRIPTED responses in main flow path.'),
                            },
                            {
                                field: tr('Regla de diseño recomendada', 'Recommended design rule'),
                                purpose: tr('Usá acciones explícitas para cambios de estado críticos. No dejes que decisiones duras dependan solo del texto libre.', 'Use explicit actions for critical state changes. Do not let hard decisions depend only on free-form text.'),
                                example: tr('Cambio de arquetipo o fase: mejor por `SET_VAR` condicionado.', 'Archetype/phase changes: better through conditioned `SET_VAR`.'),
                            },
                        ]}
                    />

                    <SectionHeading
                        icon={<Workflow className="h-6 w-6 text-primary" />}
                        title={tr('20) Patrones listos (copy fijo + lógica determinística + contadores)', '20) Ready-made patterns (fixed copy + deterministic logic + counters)')}
                        subtitle={tr(
                            'Blueprint operativo para casos típicos: inicio con locks, reconducción, contador de intentos, cierre por gate y post-cierre.',
                            'Operational blueprint for common cases: lock-based intro, reconduction, attempt counter, gated close, and post-close.',
                        )}
                    />

                    <Process
                        steps={[
                            tr('1) Variables lock: `day_lock`, `name_lock`, `archetype_lock`, `vehicle_lock`, `pedido_lock`.', '1) Lock variables: `day_lock`, `name_lock`, `archetype_lock`, `vehicle_lock`, `pedido_lock`.'),
                            tr('2) Intro SCRIPTED interpolado con locks. No volver a setear estos locks salvo reset explícito.', '2) Interpolated SCRIPTED intro with locks. Do not reset these locks unless explicit reset is triggered.'),
                            tr('3) Global `g_reset` con trigger PHRASE_LIST y acciones SET_VAR para flags/counters a estado inicial.', '3) Global `g_reset` with PHRASE_LIST trigger and SET_VAR actions resetting flags/counters to initial state.'),
                            tr('4) Global reconducción (1 y 2) para off-topic/meta; mantener arriba en orden de interrupciones.', '4) Global reconduction (1 and 2) for off-topic/meta; keep near top in interrupt order.'),
                            tr('5) Paso de pago puntual en SCRIPTED para frases tipo "¿Cómo pagás?" -> responder solo medio.', '5) Payment-specific SCRIPTED step for "How do you pay?" style phrases -> answer with payment method only.'),
                            tr('6) Contador por acción `INCREMENT` (ejemplo `app_q_count`) cada vez que activa el módulo de la app.', '6) Counter via `INCREMENT` action (example `app_q_count`) every time the app module triggers.'),
                            tr('7) Gate de cierre con AFTER_STEP + PHRASE_LIST + guardrails para evitar cierre cuando hay pregunta abierta.', '7) Close gate with AFTER_STEP + PHRASE_LIST + guardrails to avoid closing while open question exists.'),
                            tr('8) Post-cierre global con respuesta fija y END_SESSION para mantener copy idéntico siempre.', '8) Post-close global with fixed response and END_SESSION to keep copy always identical.'),
                        ]}
                    />

                    <CodeExample
                        title={tr('Plantilla operacional mínima (Simulador determinístico robusto)', 'Minimum operational template (robust deterministic simulator)')}
                        code={`Variables:
- locks de identidad/escenario (random o random_by)
- flags numéricos (0/1) para gates de cierre
- counters con INCREMENT para seguimiento de módulo

Global interrupts (orden recomendado):
1) g_reset
2) g_reconduccion_1
3) g_reconduccion_2
4) g_post_cierre_repeat

Flow principal:
1) paso_intro (SCRIPTED/START)
2) paso_operativo_llm (LLM/DEFAULT al final)
3) pasos guionados críticos (pago, cierre, mensajes institucionales)

Acciones:
- SET_VAR para estados binarios (ej: pago_ok=1)
- INCREMENT para conteos (ej: app_q_count += 1)
- END_SESSION solo en fase terminal`}
                    />

                    <SectionHeading
                        icon={<FileText className="h-6 w-6 text-primary" />}
                        title={tr('21) Diagnóstico hiper-práctico: síntoma -> causa probable -> ajuste', '21) Hyper-practical diagnosis: symptom -> likely cause -> fix')}
                        subtitle={tr(
                            'Cuando algo "no cuadra", esta tabla te permite encontrar causa sin tocar todo a ciegas.',
                            'When behavior feels off, this table helps you find root cause without blindly changing everything.',
                        )}
                    />

                    <Rows
                        rows={[
                            {
                                field: tr('Repite contexto inicial en mitad de charla', 'Repeats initial context mid-conversation'),
                                purpose: tr('Suele faltar lock (`intro_done`) o falta trigger/condición que bloquee re-intro.', 'Usually missing lock (`intro_done`) or missing trigger/condition blocking re-intro.'),
                                example: tr('Agregar `SET_VAR intro_done=1` y condición que impida relanzar intro.', 'Add `SET_VAR intro_done=1` and condition preventing intro relaunch.'),
                            },
                            {
                                field: tr('No dispara paso específico aunque parece obvio', 'Specific step does not fire although it seems obvious'),
                                purpose: tr('Recordá que triggers del mismo paso son AND. Puede estar fallando uno solo (ej. AFTER_STEP vacío).', 'Remember triggers inside same step are AND. A single trigger may be failing (e.g. empty AFTER_STEP).'),
                                example: tr('Verificar trigger por trigger dentro de la misma tarjeta.', 'Verify trigger-by-trigger inside that same card.'),
                            },
                            {
                                field: tr('DEFAULT captura demasiado temprano', 'DEFAULT captures too early'),
                                purpose: tr('Está ubicado por encima de casos específicos o existe DEFAULT en globals arriba.', 'It is placed above specific cases or a global DEFAULT exists too high.'),
                                example: tr('Mover DEFAULT al final en cada lista.', 'Move DEFAULT to bottom in each list.'),
                            },
                            {
                                field: tr('SET_VAR no cambia nada', 'SET_VAR seems to do nothing'),
                                purpose: tr('La acción probablemente tiene `var` vacía o nombre no coincide con variable real.', 'Action probably has empty `var` or name does not match a real variable.'),
                                example: tr('Elegir variable desde datalist para evitar typo.', 'Pick variable from datalist to avoid typo.'),
                            },
                            {
                                field: tr('INCREMENT da valores raros', 'INCREMENT produces odd values'),
                                purpose: tr('Si valor previo era string/no número, runtime coerciona y puede caer en 0 antes de sumar.', 'If previous value is a string/non-number, runtime coerces and may fallback to 0 before increment.'),
                                example: tr('Inicializar contador con number (0) desde inicio.', 'Initialize counter as number (0) at start.'),
                            },
                            {
                                field: tr('PHRASE_LIST no matchea frases muy parecidas', 'PHRASE_LIST does not match very similar phrases'),
                                purpose: tr('Puede estar bloqueado por guardrails o por negativos; no siempre es problema de fuzzy.', 'It may be blocked by guardrails or negative phrases; not always a fuzzy issue.'),
                                example: tr('Revisar `guardrails` y `negative_phrases` antes de tocar umbrales.', 'Review `guardrails` and `negative_phrases` before changing thresholds.'),
                            },
                            {
                                field: tr('Copy crítico sale diferente entre sesiones', 'Critical copy differs between sessions'),
                                purpose: tr('Ese tramo quedó en LLM en lugar de SCRIPTED, o depende de variable no bloqueada.', 'That segment remains in LLM instead of SCRIPTED, or depends on non-locked variable.'),
                                example: tr('Mover copy contractual a paso SCRIPTED con placeholders lock.', 'Move contractual copy to SCRIPTED step with lock placeholders.'),
                            },
                            {
                                field: tr('Variables renombradas "rompen" placeholders', 'Renamed variables break placeholders'),
                                purpose: tr('Renombrar variable no reescribe referencias existentes en pasos/triggers.', 'Renaming a variable does not auto-rewrite existing step/trigger references.'),
                                example: tr('Buscar `{variable}` manualmente y corregir todas las referencias.', 'Search `{variable}` manually and fix all references.'),
                            },
                        ]}
                    />

                    <Callout
                        title={tr('Aclaración sobre veredictos en SIMULATOR', 'Clarification about verdict templates in SIMULATOR')}
                        text={tr(
                            'SIMULATOR no trae plantilla nativa de veredicto final como DETECTOR. Si necesitás una salida final fija de evaluación, la construís como copy guionado en pasos de cierre (SCRIPTED) + variables de estado (SET_VAR/INCREMENT) para sostener consistencia.',
                            'SIMULATOR has no native final-verdict template like DETECTOR. If you need fixed final-evaluation output, build it as scripted closing copy (SCRIPTED) plus state variables (SET_VAR/INCREMENT) to keep consistency.',
                        )}
                    />

                    <CodeExample
                        title={tr('Checklist técnico rápido (Simulador)', 'Quick technical checklist (Simulator)')}
                        code={`[ ] Variables definidas y sin placeholders huérfanos
[ ] Global interrupts ordenadas de mayor a menor prioridad operativa
[ ] DEFAULT al final (global y flow)
[ ] Pasos críticos en SCRIPTED
[ ] LLM solo donde aporta variación real
[ ] Acciones SET_VAR/INCREMENT conectadas al estado
[ ] Sin IDs duplicados
[ ] Sin next_step rotos
[ ] Regex válidas y no riesgosas
[ ] Ensayos de conversación completos (inicio -> cierre)`}
                    />

                    <Callout
                        title={tr('Regla de oro final', 'Final golden rule')}
                        text={tr(
                            'Si querés comportamiento 100% repetible: guioná más pasos y reducí decisiones del LLM. Si querés mayor naturalidad: abrí espacios LLM pero protegidos con variables, triggers y guardrails.',
                            'If you need 100% repeatable behavior: script more steps and reduce LLM decisions. If you need more natural language: open LLM space but protect it with variables, triggers, and guardrails.',
                        )}
                    />
                </div>
            ),
        },
        {
            id: 'generic',
            label: tr('4. Estrategia GENERIC (Guía Maestra)', '4. GENERIC Strategy (Master Guide)'),
            icon: <MessageSquare className="h-4 w-4" />,
            render: () => (
                <div className="space-y-8">
                    <SectionHeading
                        icon={<MessageSquare className="h-8 w-8 text-primary" />}
                        title={tr('Estrategia: GENERIC (Manual Operativo Detallado)', 'Strategy: GENERIC (Detailed Operational Manual)')}
                        subtitle={tr(
                            'Guía completa para configurar y operar la estrategia más flexible del sistema. Está pensada para asistentes conversacionales con control suficiente, sin la complejidad total de un simulador por pasos.',
                            'Complete guide to configure and operate the most flexible strategy in the system. It is intended for conversational assistants with enough control, without full simulator-by-steps complexity.',
                        )}
                    />

                    <Grid>
                        <InfoCard
                            title={tr('Qué sí hace', 'What it does')}
                            body={tr(
                                'Combina prompt de comportamiento + mensaje inicial + bloqueadores globales + reglas de cierre/despedida + respuesta LLM con sanitización. Puede usar variables de sesión, RAG y disparadores de imagen.',
                                'Combines behavior prompt + intro message + global blockers + close/goodbye rules + LLM responses with sanitization. It can use session variables, RAG, and image triggers.',
                            )}
                        />
                        <InfoCard
                            title={tr('Qué no hace', 'What it does not do')}
                            body={tr(
                                'No trae una máquina de evaluación formal como EXAMINER ni inspección por pasos con veredicto técnico como DETECTOR. Si necesitás secuencias rígidas de entrenamiento, conviene SIMULATOR.',
                                'It does not include a formal evaluation state machine like EXAMINER or step-by-step inspection with technical verdict like DETECTOR. If you need rigid training sequences, SIMULATOR is better.',
                            )}
                        />
                    </Grid>

                    <Callout
                        title={tr('Regla de diseño recomendada', 'Recommended design rule')}
                        text={tr(
                            'Usá GENERIC cuando querés conversación natural pero con barandas operativas: cierres definidos, bloqueadores globales, copy editable y seguridad de salida. Si la interacción depende de una secuencia estricta de estados, migrá a SIMULATOR.',
                            'Use GENERIC when you need natural conversation with operational guardrails: defined closures, global blockers, editable copy, and safe output. If interaction depends on strict state sequencing, move to SIMULATOR.',
                        )}
                    />

                    <SectionHeading
                        icon={<Workflow className="h-6 w-6 text-primary" />}
                        title={tr('1) Flujo real del runtime (orden exacto de ejecución)', '1) Real runtime flow (exact execution order)')}
                        subtitle={tr(
                            'Qué pasa en backend en cada turno cuando el bot es GENERIC.',
                            'What happens in backend on each turn when bot type is GENERIC.',
                        )}
                    />

                    <Process
                        steps={[
                            tr('1) Se valida si la sesión ya terminó (`ended=true`). Si terminó, no procesa más lógica.', '1) It checks whether the session has already ended (`ended=true`). If ended, no further logic runs.'),
                            tr('2) Se resuelve API key y parámetros base de orquestación (modelo, prompt id, RAG normalizado).', '2) It resolves API key and base orchestration parameters (model, prompt id, normalized RAG).'),
                            tr('3) Si hay motor de flujo habilitado (flow_steps/global_triggers), primero procesa ese estado.', '3) If flow engine is enabled (flow_steps/global_triggers), it processes that state first.'),
                            tr('4) Si no hay estado de flow, inicializa variables/estado de sesión.', '4) If there is no flow state, it initializes session variables/state.'),
                            tr('5) Si un paso SCRIPTED del flow responde, devuelve ese texto ya sanitizado y termina el turno.', '5) If a SCRIPTED flow step responds, it returns that text (already sanitized) and ends the turn.'),
                            tr('6) Si NO hay flow, recupera `session_vars` desde metadata. Si faltan y hay config, las bootstrapea y persiste.', '6) If there is NO flow, it recovers `session_vars` from metadata. If missing and config exists, it bootstraps and persists them.'),
                            tr('7) Solo para GENERIC: evalúa intención terminal configurable (`goodbye`/`closing`) antes de bypass y antes de LLM.', '7) GENERIC only: evaluates configurable terminal intent (`goodbye`/`closing`) before bypass and before LLM.'),
                            tr('8) Si matchea intención terminal y hay copy configurado, responde, registra mensajes y marca `ended=true`.', '8) If terminal intent matches and copy exists, it responds, logs messages, and marks `ended=true`.'),
                            tr('9) Si no cierra, evalúa `bypass_logic` (regex legacy). Si matchea, devuelve respuesta sanitizada.', '9) If it does not close, it evaluates `bypass_logic` (legacy regex). If matched, it returns sanitized response.'),
                            tr('10) Si nada intercepta, arma historial + instrucciones y ejecuta llamada al modelo.', '10) If nothing intercepts, it builds history + instructions and calls the model.'),
                            tr('11) Procesa actualización de variables de sesión embebidas (si aplica protocolo de update).', '11) It processes embedded session variable updates (if update protocol applies).'),
                            tr('12) Calcula costo/tokens, aplica image triggers y sanitiza salida final.', '12) It calculates cost/tokens, applies image triggers, and sanitizes final output.'),
                            tr('13) Guarda mensajes en base, persiste metadata/vars y retorna respuesta al frontend.', '13) It stores messages in DB, persists metadata/vars, and returns response to frontend.'),
                        ]}
                    />

                    <SectionHeading
                        icon={<Settings2 className="h-6 w-6 text-primary" />}
                        title={tr('2) Mapa completo de UI en estrategia Genérico', '2) Full UI map for Generic strategy')}
                        subtitle={tr(
                            'Qué configura cada bloque visible del editor cuando el tipo de bot es GENERIC.',
                            'What each visible editor block configures when bot type is GENERIC.',
                        )}
                    />

                    <Rows
                        rows={[
                            {
                                field: tr('Identidad y Reglas', 'Identity & Rules'),
                                purpose: tr('Campo principal `instructions_prefix`. Define rol, tono, límites y objetivo operativo del bot.', 'Main `instructions_prefix` field. Defines role, tone, limits, and operational objective.'),
                                example: tr('“Sos asistente técnico de postventa…”', '"You are a post-sales technical assistant..."'),
                            },
                            {
                                field: tr('Mensaje de Introducción', 'Introduction Message'),
                                purpose: tr('`intro_message` se envía al iniciar sesión. Acepta placeholders de variables `{x}`.', '`intro_message` is sent at session start. Supports variable placeholders `{x}`.'),
                                example: tr('“Hola {nombre}, te ayudo con…”', '"Hi {name}, I can help you with..."'),
                            },
                            {
                                field: tr('Mensajes de Cierre', 'Closing Messages'),
                                purpose: tr('Incluye `goodbye_message` y `closing_message`. Son los copys finales cuando disparan reglas terminales.', 'Includes `goodbye_message` and `closing_message`. These are final copies used when terminal rules trigger.'),
                                example: tr('Despedida por no continuar vs cierre por tarea completada.', 'Goodbye for not continuing vs close for completed interaction.'),
                            },
                            {
                                field: tr('Reglas de fin (editable)', 'End rules (editable)'),
                                purpose: tr('Configura frases que disparan despedida o cierre final, más un guardrail opcional para mensajes con pregunta.', 'Configures phrases that trigger goodbye or final close, plus an optional guardrail for question-like messages.'),
                                example: tr('`generic_interaction.*`', '`generic_interaction.*`'),
                            },
                            {
                                field: tr('Bloqueadores globales', 'Global blockers'),
                                purpose: tr('Interrupciones que corren antes de toda lógica principal. Útil para seguridad, reconducción, reset y políticas.', 'Interruptions that run before all main logic. Useful for safety, reconduction, reset, and policy controls.'),
                                example: tr('Abuso, off-topic, comandos de control.', 'Abuse, off-topic, control commands.'),
                            },
                            {
                                field: tr('Disparadores de imagen', 'Image triggers'),
                                purpose: tr('Reglas regex que anexan imágenes a la respuesta final del bot.', 'Regex rules that append images to final bot response.'),
                                example: tr('Si menciona “manual”, mostrar diagrama.', 'If it mentions “manual”, show a diagram.'),
                            },
                        ]}
                    />

                    <SectionHeading
                        icon={<RotateCcw className="h-6 w-6 text-primary" />}
                        title={tr('3) Reglas de fin 100% configurables (sin hardcode)', '3) Fully configurable end rules (no hardcode)')}
                        subtitle={tr(
                            'Cómo funciona exactamente el bloque `generic_interaction` y en qué orden se evalúa.',
                            'How the `generic_interaction` block works exactly and in which evaluation order.',
                        )}
                    />

                    <Rows
                        rows={[
                            {
                                field: 'generic_interaction.goodbye_intent_phrases',
                                purpose: tr('Lista de frases para detectar intención de “no continuar”. Se evalúa primero.', 'Phrase list to detect “do not continue” intent. Evaluated first.'),
                                example: tr('no quiero seguir, lo dejamos acá, parar ahora', 'i do not want to continue, let us stop here, stop now'),
                            },
                            {
                                field: 'generic_interaction.closing_intent_phrases',
                                purpose: tr('Lista de frases para detectar interacción finalizada. Se evalúa después de goodbye.', 'Phrase list to detect completed interaction. Evaluated after goodbye intents.'),
                                example: tr('listo gracias, terminamos, hasta luego', 'done thanks, we are done, see you'),
                            },
                            {
                                field: 'generic_interaction.ignore_question_messages',
                                purpose: tr('Si es `true` (default), no dispara reglas de fin cuando el mensaje tiene “?” o “¿”.', 'If `true` (default), end rules do not trigger when message includes “?” or “¿”.'),
                                example: tr('Evita cerrar por error cuando usuario sigue preguntando.', 'Avoids accidental closing while user is still asking.'),
                            },
                            {
                                field: tr('Normalización de texto', 'Text normalization'),
                                purpose: tr('Runtime baja a minúsculas, quita acentos y signos para comparar de forma robusta.', 'Runtime lowercases, removes accents and punctuation for robust matching.'),
                                example: tr('“acá” y “aca” matchean igual.', '"acá" and "aca" match the same.'),
                            },
                            {
                                field: tr('Regla de matching', 'Matching rule'),
                                purpose: tr('Coincide por igualdad completa de frase o por presencia delimitada por tokens (no substring suelta riesgosa).', 'Matches by full phrase equality or token-bounded presence (not risky loose substring).'),
                                example: tr('“listo gracias” matchea; “listografia” no.', '"done thanks" matches; "listography" does not.'),
                            },
                            {
                                field: tr('Dependencia de copy final', 'Final copy dependency'),
                                purpose: tr('Si detecta intención terminal pero el mensaje (`goodbye_message` o `closing_message`) está vacío, no cierra forzadamente.', 'If terminal intent is detected but (`goodbye_message` or `closing_message`) is empty, it does not force close.'),
                                example: tr('Diseño explícito: todo copy terminal es editable por bot.', 'Explicit design: all terminal copy is bot-editable.'),
                            },
                        ]}
                    />

                    <Callout
                        title={tr('Resultado operativo clave', 'Key operational outcome')}
                        text={tr(
                            'La estrategia Genérico ya no depende de frases internas fijas para finalizar. El comportamiento terminal depende de tu configuración en UI: frases + copy.',
                            'Generic strategy no longer depends on fixed internal phrases to end. Terminal behavior depends on your UI configuration: phrases + copy.',
                        )}
                    />

                    <SectionHeading
                        icon={<GitBranch className="h-6 w-6 text-primary" />}
                        title={tr('4) Bloqueadores globales y variables: cómo encajan en Generic', '4) Global blockers and variables: how they fit in Generic')}
                        subtitle={tr(
                            'Aunque Genérico sea simple, puede usar flow engine para controles finos.',
                            'Even though Generic is simple, it can still use flow engine for fine-grained controls.',
                        )}
                    />

                    <Rows
                        rows={[
                            {
                                field: tr('Session vars en global blockers', 'Session vars in global blockers'),
                                purpose: tr('Las variables editadas en ese panel se persisten correctamente en `session_vars` del bot.', 'Variables edited in that panel are properly persisted into bot `session_vars`.'),
                                example: tr('flags de estado, contadores, perfil de usuario', 'state flags, counters, user profile'),
                            },
                            {
                                field: tr('Global triggers antes que todo', 'Global triggers before everything'),
                                purpose: tr('Se ejecutan antes de respuestas LLM del turno. Son capa de control transversal.', 'They execute before LLM responses for the turn. They are a transversal control layer.'),
                                example: tr('Moderación, reconducción, reset.', 'Moderation, reconduction, reset.'),
                            },
                            {
                                field: tr('Acciones útiles', 'Useful actions'),
                                purpose: tr('`SET_VAR`, `INCREMENT`, `END_SESSION` permiten sostener estado sin depender del modelo.', '`SET_VAR`, `INCREMENT`, `END_SESSION` let you maintain state without depending on the model.'),
                                example: tr('contador de advertencias, flag de cierre, lock de contexto', 'warning counter, close flag, context lock'),
                            },
                            {
                                field: tr('Cuándo NO usar flow', 'When NOT to use flow'),
                                purpose: tr('Si no necesitás interrupciones ni estado determinístico, podés dejar solo prompt + terminal intents + LLM.', 'If you do not need interrupts or deterministic state, keep only prompt + terminal intents + LLM.'),
                                example: tr('FAQ conversacional simple.', 'Simple conversational FAQ.'),
                            },
                        ]}
                    />

                    <SectionHeading
                        icon={<Code2 className="h-6 w-6 text-primary" />}
                        title={tr('5) `bypass_logic` (legacy): cuándo usar y cuándo evitar', '5) `bypass_logic` (legacy): when to use and when to avoid')}
                        subtitle={tr(
                            'Sigue disponible, pero conviene usarlo con criterio porque trabaja por regex.',
                            'Still available, but should be used carefully because it works via regex.',
                        )}
                    />

                    <Rows
                        rows={[
                            {
                                field: tr('Qué hace', 'What it does'),
                                purpose: tr('Mapea regex -> respuesta fija. Si matchea, responde sin ir al modelo.', 'Maps regex -> fixed response. If matched, responds without calling model.'),
                                example: tr('^ayuda$ -> “Decime en qué te ayudo…”', '^help$ -> "Tell me how I can help..."'),
                            },
                            {
                                field: tr('Orden de evaluación', 'Evaluation order'),
                                purpose: tr('Corre después de reglas terminales de Generic y antes del LLM.', 'Runs after Generic terminal rules and before LLM.'),
                                example: tr('terminal intents -> bypass -> LLM', 'terminal intents -> bypass -> LLM'),
                            },
                            {
                                field: tr('Sanitización', 'Sanitization'),
                                purpose: tr('Las respuestas de bypass pasan por image triggers y sanitización.', 'Bypass responses go through image triggers and sanitization.'),
                                example: tr('Protege salida visible contra contenido indeseado.', 'Protects visible output from unsafe content.'),
                            },
                            {
                                field: tr('Riesgo principal', 'Main risk'),
                                purpose: tr('Regex demasiado amplia puede interceptar más de lo esperado.', 'Overly broad regex can intercept more than expected.'),
                                example: tr('Usar patrones concretos y testearlos.', 'Use specific patterns and test them.'),
                            },
                        ]}
                    />

                    <SectionHeading
                        icon={<ShieldCheck className="h-6 w-6 text-primary" />}
                        title={tr('6) Seguridad de salida y consistencia', '6) Output safety and consistency')}
                        subtitle={tr(
                            'Qué capas de seguridad se aplican en Generic y por qué importa.',
                            'Which safety layers are applied in Generic and why it matters.',
                        )}
                    />

                    <Rows
                        rows={[
                            {
                                field: tr('sanitizeResponse', 'sanitizeResponse'),
                                purpose: tr('Se aplica a respuestas de flow SCRIPTED, bypass, terminal y LLM.', 'Applied to flow SCRIPTED, bypass, terminal, and LLM responses.'),
                                example: tr('Quita tags/script/meta no permitidos.', 'Removes disallowed tags/script/meta.'),
                            },
                            {
                                field: tr('processImageTriggers', 'processImageTriggers'),
                                purpose: tr('Puede anexar imágenes en todos los caminos determinísticos y LLM del turno.', 'Can append images in deterministic and LLM turn paths.'),
                                example: tr('Respuesta + imagen educativa automática.', 'Response + automatic educational image.'),
                            },
                            {
                                field: tr('Persistencia de vars', 'Variable persistence'),
                                purpose: tr('Las `session_vars` se sincronizan en metadata para sostener coherencia entre turnos.', '`session_vars` are synced into metadata to keep coherence across turns.'),
                                example: tr('locks, flags y contadores estables.', 'stable locks, flags, and counters.'),
                            },
                            {
                                field: tr('Sin hardcode terminal', 'No terminal hardcode'),
                                purpose: tr('El cierre/despedida depende de tu configuración editable. No hay frase de fallback oculta.', 'Close/goodbye depends on your editable config. There is no hidden fallback phrase.'),
                                example: tr('Control total del copy por bot.', 'Full per-bot copy control.'),
                            },
                        ]}
                    />

                    <SectionHeading
                        icon={<FileSearch className="h-6 w-6 text-primary" />}
                        title={tr('7) RAG en Generic (opcional)', '7) RAG in Generic (optional)')}
                        subtitle={tr(
                            'Generic puede operar sin RAG. Activarlo tiene sentido solo cuando necesitás respaldo documental real.',
                            'Generic can run without RAG. Enable it only when you need real documentary backing.',
                        )}
                    />

                    <Rows
                        rows={[
                            {
                                field: tr('Modo recomendado por defecto', 'Recommended default mode'),
                                purpose: tr('`never` para asistentes conversacionales simples y costo estable.', '`never` for simple conversational assistants and stable cost.'),
                                example: 'rag_config.mode = never',
                            },
                            {
                                field: tr('Cuándo activarlo', 'When to enable'),
                                purpose: tr('Cuando el bot debe citar o usar información de documentos que cambia en el tiempo.', 'When the bot must rely on or cite time-varying document information.'),
                                example: tr('políticas internas, procedimientos, catálogos.', 'internal policies, procedures, catalogs.'),
                            },
                            {
                                field: tr('Riesgo de mala configuración', 'Misconfiguration risk'),
                                purpose: tr('RAG activo sin vector store útil agrega costo y ruido sin mejorar precisión.', 'Active RAG without useful vector store adds cost/noise without improving precision.'),
                                example: tr('Siempre validar evidencia recuperada.', 'Always validate retrieved evidence.'),
                            },
                        ]}
                    />

                    <CodeExample
                        title={tr('Ejemplo mínimo recomendado (Genérico con cierre editable)', 'Recommended minimum example (Generic with editable close)')}
                        code={`{
  "instructions_prefix": "Sos asistente de soporte. Responde breve, claro y sin lenguaje meta.",
  "intro_message": "Hola, contame qué necesitás resolver hoy.",
  "goodbye_message": "Perfecto, lo dejamos acá. Cuando quieras retomamos.",
  "closing_message": "Excelente, quedó todo resuelto. Gracias por tu tiempo.",
  "generic_interaction": {
    "goodbye_intent_phrases": ["no quiero seguir", "lo dejamos aca", "parar ahora"],
    "closing_intent_phrases": ["listo gracias", "terminamos", "hasta luego"],
    "ignore_question_messages": true
  },
  "global_triggers": [],
  "flow_steps": [],
  "rag_config": { "mode": "never" }
}`}
                    />

                    <SectionHeading
                        icon={<Wrench className="h-6 w-6 text-primary" />}
                        title={tr('8) Errores típicos y cómo resolverlos', '8) Typical errors and how to resolve them')}
                        subtitle={tr(
                            'Checklist de diagnóstico específico para Generic.',
                            'Generic-specific troubleshooting checklist.',
                        )}
                    />

                    <Rows
                        rows={[
                            {
                                field: tr('No dispara despedida/cierre', 'Goodbye/close does not trigger'),
                                purpose: tr('Revisar listas en `generic_interaction`, copy final no vacío, y flag de preguntas.', 'Check `generic_interaction` lists, non-empty final copy, and question-ignore flag.'),
                                example: tr('Si el mensaje tiene “?” y ignore=true, no cierra.', 'If message contains “?” and ignore=true, it will not close.'),
                            },
                            {
                                field: tr('Cierra cuando no corresponde', 'It closes when it should not'),
                                purpose: tr('Frases demasiado amplias en listas terminales o regex legacy interceptando de más.', 'Overly broad terminal phrases or legacy regex intercepting too much.'),
                                example: tr('Reducir frases genéricas y usar expresiones más concretas.', 'Narrow generic phrases and use more concrete expressions.'),
                            },
                            {
                                field: tr('Variables inconsistentes', 'Inconsistent variables'),
                                purpose: tr('Verificar inicialización de `session_vars`, acciones `SET_VAR/INCREMENT` y placeholders.', 'Verify `session_vars` initialization, `SET_VAR/INCREMENT` actions, and placeholders.'),
                                example: tr('No renombrar variable sin revisar referencias.', 'Do not rename variables without reviewing references.'),
                            },
                            {
                                field: tr('Respuestas inseguras/no sanitizadas', 'Unsafe / unsanitized responses'),
                                purpose: tr('Confirmar que el camino usado no bypassée capas (flow/bypass/terminal ya están cubiertos).', 'Confirm used path does not bypass safety layers (flow/bypass/terminal are now covered).'),
                                example: tr('Validar salida final en conversación real.', 'Validate final output in a real conversation.'),
                            },
                            {
                                field: tr('Bot demasiado impredecible', 'Bot too unpredictable'),
                                purpose: tr('Prompts ambiguos y ausencia de bloqueadores o reglas terminales claras.', 'Ambiguous prompts and missing blockers or clear terminal rules.'),
                                example: tr('Definir límites explícitos + global blockers.', 'Define explicit limits + global blockers.'),
                            },
                        ]}
                    />

                    <Process
                        steps={[
                            tr('1) Definí `instructions_prefix` con rol/límites en una sola pantalla.', '1) Define `instructions_prefix` with role/limits in one screen.'),
                            tr('2) Cargá `intro_message` simple y medible.', '2) Set a simple, testable `intro_message`.'),
                            tr('3) Definí `goodbye_message` y `closing_message` (nunca vacíos si vas a usar reglas terminales).', '3) Define `goodbye_message` and `closing_message` (never empty if using terminal rules).'),
                            tr('4) Cargá listas de `generic_interaction` con frases concretas y no ambiguas.', '4) Fill `generic_interaction` lists with concrete, non-ambiguous phrases.'),
                            tr('5) Probá 3 conversaciones reales: normal, no-continuar, cierre-final.', '5) Test 3 real conversations: normal, do-not-continue, final-close.'),
                            tr('6) Recién después agregá bypass/global blockers/RAG si realmente aportan valor.', '6) Only then add bypass/global blockers/RAG if they truly add value.'),
                        ]}
                    />
                </div>
            ),
        },
        {
            id: 'examiner',
            label: tr('5. Estrategia EXAMINER (Guía Maestra)', '5. EXAMINER Strategy (Master Guide)'),
            icon: <ShieldCheck className="h-4 w-4" />,
            render: () => (
                <div className="space-y-8">
                    <SectionHeading
                        icon={<ShieldCheck className="h-8 w-8 text-primary" />}
                        title={tr('Estrategia: EXAMINER', 'Strategy: EXAMINER')}
                        subtitle={tr(
                            'Guía técnica detallada (sin atajos) para configurar, importar y operar el Examinador de forma determinista y escalable.',
                            'Detailed technical guide (no shortcuts) to configure, import, and run Examiner bots deterministically at scale.',
                        )}
                    />

                    <Callout
                        title={tr('Qué es (exactamente) un Examinador', 'What an Examiner is (exactly)')}
                        text={tr(
                            'Es un motor de preguntas controlado por configuración. El código selecciona la pregunta, el modelo evalúa semánticamente la respuesta, y el bot devuelve feedback scripted o semántico según la política de cada pregunta. No está pensado para “charla libre”.',
                            'It is a configuration-driven question engine. Code selects the question, the model semantically evaluates the answer, and the bot returns scripted or semantic feedback based on per-question policy. It is not designed for free chat.',
                        )}
                    />

                    <SectionHeading
                        icon={<Workflow className="h-6 w-6 text-primary" />}
                        title={tr('1) Flujo interno del runtime (orden real)', '1) Internal runtime flow (real order)')}
                        subtitle={tr(
                            'Esto es lo que hace el backend en cada turno, en el orden exacto.',
                            'This is exactly what the backend does each turn, in strict order.',
                        )}
                    />

                    <Process
                        steps={[
                            tr('1) Mensaje inicial (`intro_message`) y confirmación de inicio.', '1) Initial message (`intro_message`) and start confirmation.'),
                            tr('2) Si `by_topic` + `topic_config.enabled`, se activa router de tema (regex/alias + opcional clasificador LLM).', '2) If `by_topic` + `topic_config.enabled`, topic router starts (regex/aliases + optional LLM classifier).'),
                            tr('3) Se arma el set de preguntas según modo (`standard` o `sequence`).', '3) Question set is assembled by mode (`standard` or `sequence`).'),
                            tr('4) Se emite una pregunta por turno (con media opcional).', '4) One question is emitted per turn (optional media).'),
                            tr('5) Evaluación determinística por claves + opcional evaluación semántica LLM.', '5) Deterministic key matching + optional LLM semantic evaluation.'),
                            tr('6) Se aplica política de reintento por pregunta (`max_attempts`, templates, modo de continuación).', '6) Per-question retry policy is applied (`max_attempts`, templates, continue mode).'),
                            tr('7) Si corresponde, se dispara mensaje intermedio (descanso) después de la pregunta N.', '7) If configured, interstitial message triggers after question N.'),
                            tr('8) Al terminar, cierre en 2 pasos: duda (`closing_config`) y cierre final (`closing_message`).', '8) At the end, 2-step closing: doubt prompt (`closing_config`) and final close (`closing_message`).'),
                        ]}
                    />

                    <SectionHeading
                        icon={<Settings2 className="h-6 w-6 text-primary" />}
                        title={tr('2) Mapa del editor visual: qué hace cada sección', '2) Visual editor map: what each section does')}
                        subtitle={tr(
                            'Resumen funcional de cada bloque de UI de Examinador.',
                            'Functional summary of each Examiner UI block.',
                        )}
                    />

                    <Rows
                        rows={[
                            {
                                field: tr('Mensaje de Introducción', 'Introduction Message'),
                                purpose: tr('Primer turno del bot. Si está vacío, usa default interno.', 'Bot first turn. If empty, internal default is used.'),
                                example: tr('Usá acá la apertura fija de tu guion.', 'Put your fixed opening script here.'),
                            },
                            {
                                field: tr('Mensaje de despedida', 'Goodbye Message'),
                                purpose: tr('Respuesta cuando el usuario decide no continuar.', 'Response when user chooses not to continue.'),
                                example: tr('"Gracias por tu tiempo..."', '"Thanks for your time..."'),
                            },
                            {
                                field: tr('Mensaje de cierre', 'Closing Message'),
                                purpose: tr('Contiene tres textos: paso 1 dudas, paso 1b pedir detalle, y cierre final.', 'Contains three texts: step 1 doubts, step 1b ask detail, and final closing text.'),
                                example: tr('"Hemos terminado las preguntas..." + cierre final.', '"We finished the questions..." + final close.'),
                            },
                            {
                                field: tr('Selección de tema', 'Topic Selection'),
                                purpose: tr('Router opcional por tema/rol. Puede exigir una sola tarea y confirmar tema antes de examinar.', 'Optional topic/role router. Can require a single task and confirm topic before exam.'),
                                example: tr('Tema A vs Tema B, Fijo vs Móvil, etc.', 'Topic A vs Topic B, Fixed vs Mobile, etc.'),
                            },
                            {
                                field: tr('Bloqueadores globales', 'Global Blockers'),
                                purpose: tr('Reglas de interrupción que corren en cada turno antes de la pregunta actual.', 'Interrupt rules executed every turn before current question logic.'),
                                example: tr('Off-topic, abuso, desvío de objetivo.', 'Off-topic, abuse, objective drift.'),
                            },
                            {
                                field: tr('Configuración de evaluación', 'Evaluation Configuration'),
                                purpose: tr('Define modo de selección de preguntas y orden de ejecución.', 'Defines question selection mode and execution order.'),
                                example: tr('`standard` por cantidades o `sequence` por playlist.', '`standard` by counts or `sequence` by playlist.'),
                            },
                            {
                                field: tr('Mensajes intermedios (descanso)', 'Intermission Messages'),
                                purpose: tr('Mensajes entre preguntas. Pueden pausar y esperar confirmación.', 'Messages between questions. They can pause and wait for confirmation.'),
                                example: tr('Separar teóricas de casos prácticos.', 'Split theory from practical cases.'),
                            },
                            {
                                field: tr('Banco de preguntas', 'Question Bank'),
                                purpose: tr('Alta/edición de preguntas. Soporta edición fila a fila e importación masiva JSON/MD.', 'Question create/edit. Supports row-by-row editing and bulk JSON/MD import.'),
                                example: tr('520 preguntas cargadas sin edición manual una por una.', '520 questions loaded without one-by-one manual edits.'),
                            },
                        ]}
                    />

                    <SectionHeading
                        icon={<ListChecks className="h-6 w-6 text-primary" />}
                        title={tr('3) Banco de preguntas: campo por campo (detalle completo)', '3) Question bank: field by field (full detail)')}
                        subtitle={tr(
                            'Cada pregunta es un objeto con datos de contenido, evaluación y control de flujo.',
                            'Each question is an object with content, evaluation, and flow-control data.',
                        )}
                    />

                    <Rows
                        rows={[
                            { field: 'id', purpose: tr('ID único. Se usa en playlist secuencial y trazabilidad.', 'Unique ID. Used in sequence playlist and traceability.'), example: 'q_soldador_001' },
                            { field: 'topic', purpose: tr('Tema/rol de la pregunta. Vacío = común (aplica a todos).', 'Question topic/role. Empty = common (applies to all).'), example: 'Tema A' },
                            { field: 'type', purpose: tr('Tipo visual/organizativo (`teorica` o `practica`).', 'Visual/organizational type (`teorica` or `practica`).'), example: 'practica' },
                            { field: 'question', purpose: tr('Enunciado mostrado al usuario.', 'Question text shown to user.'), example: tr('¿Qué harías puntualmente?', 'What would you do specifically?') },
                            { field: 'expected_keys', purpose: tr('Base de comparación. Recomendado: bullets una línea por concepto.', 'Comparison base. Recommended: bullet lines, one concept per line.'), example: '- permiso vigente\n- análisis de riesgo\n- EPP completo' },
                            { field: 'media_url', purpose: tr('URL opcional de imagen/video. Si existe, se renderiza; si no, no muestra media.', 'Optional image/video URL. If present, it renders; if absent, no media is shown.'), example: 'https://drive.google.com/file/d/.../view' },
                            { field: 'is_mandatory', purpose: tr('Marca pregunta fija obligatoria en modo estándar.', 'Marks fixed mandatory question in standard mode.'), example: 'true' },
                            { field: 'branch_key', purpose: tr('Filtro por tema detectado. Si no coincide, la pregunta no entra.', 'Filter by detected topic. If it does not match, question is excluded.'), example: 'fijo' },
                            { field: 'max_attempts', purpose: tr('Máximo de intentos antes de feedback final y avance.', 'Maximum attempts before final feedback and moving forward.'), example: '2' },
                            { field: 'continue_mode', purpose: tr('`ask_confirm` pide confirmación. `auto_next` avanza solo.', '`ask_confirm` asks confirmation. `auto_next` advances immediately.'), example: 'auto_next' },
                            { field: 'min_expected_matches', purpose: tr('Mínimo de claves que deben matchear para considerar correcta.', 'Minimum key matches required to consider correct.'), example: '3' },
                            { field: 'min_answer_words', purpose: tr('Mínimo de palabras de respuesta (opcional).', 'Minimum answer word count (optional).'), example: '25' },
                            { field: 'min_answer_sentences', purpose: tr('Mínimo de oraciones (opcional).', 'Minimum number of sentences (optional).'), example: '3' },
                            { field: 'retry_incomplete_template', purpose: tr('Copy del primer fallo incompleto.', 'Copy for first incomplete failure.'), example: 'Lamentablemente tu respuesta es incompleta. Inténtalo de nuevo {question}' },
                            { field: 'retry_incorrect_template', purpose: tr('Copy del primer fallo incorrecto.', 'Copy for first incorrect failure.'), example: 'Lamentablemente tu respuesta es incorrecta. Inténtalo de nuevo {question}' },
                            { field: 'second_fail_template', purpose: tr('Copy cuando se agotan intentos.', 'Copy when attempts are exhausted.'), example: 'La respuesta correcta incluye:\n{expected_keys_bullets}' },
                            { field: 'correct_feedback_template', purpose: tr('Copy al responder correcto.', 'Copy for correct answer.'), example: '¡Correcto! {semantic_feedback}' },
                            { field: 'continue_prompt_template', purpose: tr('Copy al pedir avanzar (si `ask_confirm`).', 'Prompt to continue (if `ask_confirm`).'), example: '¿Seguimos con la próxima pregunta?' },
                            { field: 'evaluation_spec', purpose: tr('Bolsa opcional para reglas extra de evaluación futura.', 'Optional bag for future extra evaluation rules.'), example: '{"domain":"altura"}' },
                        ]}
                    />

                    <CodeExample
                        title={tr('Variables permitidas en templates scripted', 'Allowed variables in scripted templates')}
                        code={`{question}
{expected_keys}
{expected_keys_bullets}
{missing_keys}
{missing_keys_bullets}
{matched_count}
{required_count}
{answer_word_count}
{answer_sentence_count}
{min_answer_words}
{min_answer_sentences}
{semantic_feedback}`}
                    />

                    <SectionHeading
                        icon={<Brain className="h-6 w-6 text-primary" />}
                        title={tr('4) Evaluación semántica y lógica de intentos', '4) Semantic evaluation and retry logic')}
                        subtitle={tr(
                            'Cómo decide el motor si una respuesta está bien, incompleta o incorrecta.',
                            'How the engine decides if an answer is correct, incomplete, or incorrect.',
                        )}
                    />

                    <Process
                        steps={[
                            tr('1) Determinístico: compara `expected_keys` (rápido y barato).', '1) Deterministic: compares `expected_keys` (fast and cheap).'),
                            tr('2) Si `semantic_mode=always`, usa LLM en toda respuesta no-correcta.', '2) If `semantic_mode=always`, uses LLM on every non-correct answer.'),
                            tr('3) Si `semantic_mode=ambiguous_only`, usa LLM sólo en casos ambiguos.', '3) If `semantic_mode=ambiguous_only`, uses LLM only on ambiguous cases.'),
                            tr('4) Primer fallo: usa retry template según incompleta/incorrecta.', '4) First failure: uses retry template by incomplete/incorrect status.'),
                            tr('5) Segundo fallo (o último): usa second fail template y avanza según `continue_mode`.', '5) Second failure (or last): uses second fail template and proceeds by `continue_mode`.'),
                        ]}
                    />

                    <SectionHeading
                        icon={<GitBranch className="h-6 w-6 text-primary" />}
                        title={tr('5) Selección de tema (router): campos y comportamiento', '5) Topic router: fields and behavior')}
                        subtitle={tr(
                            'Este bloque es opcional. Se usa cuando el examen cambia por rol/tema/herramienta.',
                            'This block is optional. Use it when exam flow changes by role/topic/tool.',
                        )}
                    />

                    <Rows
                        rows={[
                            { field: 'enabled', purpose: tr('Activa/desactiva router.', 'Enables/disables router.'), example: 'true' },
                            { field: 'ask_template', purpose: tr('Mensaje inicial para pedir tarea/tema.', 'Initial message asking task/topic.'), example: tr('Para empezar, contame qué tarea vas a hacer.', 'To start, tell me which task you will do.') },
                            { field: 'confirm_template', purpose: tr('Mensaje para confirmar tema detectado. Soporta `{topic}`.', 'Confirmation message. Supports `{topic}`.'), example: 'Entendí que el tema es {topic}. ¿Es correcto?' },
                            { field: 'skip_confirmation', purpose: tr('Si true, no pide confirmación y entra directo al examen.', 'If true, skips confirmation and enters exam directly.'), example: 'false' },
                            { field: 'enforce_single_task', purpose: tr('Si true, bloquea entradas con múltiples tareas.', 'If true, blocks multi-task user inputs.'), example: 'true' },
                            { field: 'single_task_template', purpose: tr('Mensaje para pedir UNA sola tarea.', 'Message asking for ONE task.'), example: tr('Para esta evaluación necesito una sola tarea.', 'For this evaluation I need a single task.') },
                            { field: 'allow_topic_correction', purpose: tr('Permite corregir tema durante confirmación.', 'Allows topic correction during confirmation.'), example: 'true' },
                            { field: 'use_router_llm', purpose: tr('Si true, usa clasificador LLM si alias/detección directa no alcanza.', 'If true, uses LLM classifier when aliases/direct match fail.'), example: 'true' },
                            { field: 'no_topic_template', purpose: tr('Mensaje cuando no logra detectar tema.', 'Message when topic cannot be detected.'), example: tr('No pude identificar el tema. ¿Podés especificar?', 'I could not identify the topic. Can you specify?') },
                            { field: 'correction_prompt_template', purpose: tr('Mensaje cuando el usuario rechaza tema propuesto.', 'Message when user rejects proposed topic.'), example: tr('Perfecto, indicame la tarea exacta.', 'Perfect, indicate the exact task.') },
                            { field: 'topic_aliases', purpose: tr('Mapa tema -> sinónimos para detección.', 'Map topic -> synonyms for detection.'), example: '{"Tema A":["alias_a1","alias_a2"]}' },
                            { field: 'topic_feedbacks', purpose: tr('Mapa tema -> feedback inicial antes de la primera pregunta.', 'Map topic -> initial feedback before first question.'), example: '{"Tema A":"Tu tema detectado es Tema A..."}' },
                        ]}
                    />

                    <SectionHeading
                        icon={<MessageSquare className="h-6 w-6 text-primary" />}
                        title={tr('6) Mensajes intermedios (descanso)', '6) Intermission messages')}
                        subtitle={tr(
                            'Separan tramos del examen (ejemplo: teoría -> práctica).',
                            'They split exam stages (for example: theory -> practice).',
                        )}
                    />

                    <Rows
                        rows={[
                            { field: 'id', purpose: tr('Identificador único del descanso.', 'Unique intermission identifier.'), example: 'break_teoria_practica' },
                            { field: 'after_question_number', purpose: tr('Se dispara justo después de ese número de pregunta.', 'Triggers right after that question number.'), example: '2' },
                            { field: 'message', purpose: tr('Texto del descanso.', 'Intermission text.'), example: tr('Excelente, terminaste teoría.', 'Great, theory is complete.') },
                            { field: 'topics', purpose: tr('Opcional. Limita el descanso a temas concretos.', 'Optional. Restricts intermission to specific topics.'), example: '["Tema A"]' },
                            { field: 'enabled', purpose: tr('Activa/desactiva este descanso.', 'Enables/disables this intermission.'), example: 'true' },
                            { field: 'wait_for_user', purpose: tr('Si true, pausa y espera respuesta del usuario antes de la siguiente pregunta.', 'If true, pauses and waits for user reply before next question.'), example: 'true' },
                            { field: 'continue_prompt', purpose: tr('Prompt opcional para confirmar continuación en la pausa.', 'Optional continue prompt during pause.'), example: tr('¿Continuamos con los casos prácticos?', 'Continue with practical cases?') },
                        ]}
                    />

                    <SectionHeading
                        icon={<Code2 className="h-6 w-6 text-primary" />}
                        title={tr('7) JSON de importación masiva (completo)', '7) Bulk import JSON (complete)')}
                        subtitle={tr(
                            'Formato recomendado para cargar bancos grandes sin editar pregunta por pregunta.',
                            'Recommended format to load large banks without editing one question at a time.',
                        )}
                    />

                    <CodeExample
                        title={tr('Ejemplo JSON válido con todos los campos', 'Valid JSON example with all fields')}
                        code={`{
  "topics": [
    "Tema A",
    "Tema B"
  ],
  "questions": [
    {
      "id": "tema_a_t_001",
      "topic": "Tema A",
      "type": "teorica",
      "question": "¿Qué controles previos aplican antes de iniciar la tarea?",
      "expected_keys": "- permiso de trabajo\\n- analisis de riesgo\\n- extintor disponible",
      "media_url": "https://drive.google.com/file/d/xxxx/view",
      "is_mandatory": true,
      "branch_key": "Tema A",
      "max_attempts": 2,
      "continue_mode": "ask_confirm",
      "min_expected_matches": 2,
      "min_answer_words": 0,
      "min_answer_sentences": 0,
      "retry_incomplete_template": "Lamentablemente tu respuesta es incompleta. Inténtalo de nuevo {question}",
      "retry_incorrect_template": "Lamentablemente tu respuesta es incorrecta. Inténtalo de nuevo {question}",
      "second_fail_template": "Gracias por tu respuesta. La respuesta correcta incluye:\\n{expected_keys_bullets}",
      "correct_feedback_template": "Gracias por tu respuesta. Es correcta y cubre los puntos esperados.",
      "continue_prompt_template": "¿Seguimos con la próxima pregunta?",
      "evaluation_spec": {
        "custom_rule": "optional"
      }
    },
    {
      "id": "tema_a_p_001",
      "topic": "Tema A",
      "type": "practica",
      "question": "Caso práctico: observás un riesgo crítico en campo. ¿Qué harías puntualmente?",
      "expected_keys": "- detener tarea\\n- delimitar area\\n- retirar inflamables",
      "is_mandatory": false,
      "max_attempts": 2,
      "continue_mode": "auto_next"
    }
  ]
}`}
                    />

                    <Callout
                        title={tr('Nota importante sobre `expected_keys`', 'Important note about `expected_keys`')}
                        text={tr(
                            'Para evitar cortes raros, cargá `expected_keys` como bullets por línea (no una frase larga con muchas comas). Si necesitas sinónimos dentro de una clave, usá `|` dentro de la misma línea.',
                            'To avoid awkward splits, load `expected_keys` as one bullet per line (not one long sentence with many commas). If you need synonyms inside one key, use `|` in the same line.',
                        )}
                    />

                    <SectionHeading
                        icon={<FileText className="h-6 w-6 text-primary" />}
                        title={tr('8) Markdown de importación masiva (compatible)', '8) Bulk import markdown (supported)')}
                        subtitle={tr(
                            'Formato simple cuando se trabaja desde documentación curada en texto.',
                            'Simple format when working from curated text documentation.',
                        )}
                    />

                    <CodeExample
                        title={tr('Plantilla MD recomendada', 'Recommended MD template')}
                        code={`## Tema A
Preguntas teóricas
1) ¿Qué controles previos aplican antes de iniciar?
Respuesta esperada:
- permiso de trabajo
- análisis de riesgo
- extintor disponible
---
Casos prácticos
1) Observás una situación insegura en campo. ¿Qué harías puntualmente?
Respuesta esperada:
- detener tarea
- delimitar área de proyección y contacto
- retirar/aislar inflamables
---

## Tema B
Preguntas teóricas
1) ¿Qué verificás antes de usar la herramienta principal?
Respuesta esperada:
- guarda colocada
- disco compatible
- EPP completo
---`}
                    />

                    <Rows
                        rows={[
                            {
                                field: tr('Regla de parseo MD 1', 'MD parsing rule 1'),
                                purpose: tr('`##` define tema. Si no hay tema, usa `general`.', '`##` defines topic. If absent, fallback is `general`.'),
                                example: '## Tema A',
                            },
                            {
                                field: tr('Regla de parseo MD 2', 'MD parsing rule 2'),
                                purpose: tr('Encabezado "Preguntas teóricas" o "Casos prácticos" define `type`.', 'Header "Preguntas teóricas" or "Casos prácticos" defines `type`.'),
                                example: tr('Si falta sección, por defecto se asume teórica.', 'If section is missing, defaults to theoretical.'),
                            },
                            {
                                field: tr('Regla de parseo MD 3', 'MD parsing rule 3'),
                                purpose: tr('Cada `---` corta y guarda una pregunta.', 'Each `---` flushes and stores one question.'),
                                example: '---',
                            },
                            {
                                field: tr('Limitación MD', 'MD limitation'),
                                purpose: tr('El MD no trae todos los campos avanzados (reintentos, branch, etc.). Para eso usá JSON.', 'MD does not include all advanced fields (retries, branch, etc.). Use JSON for that.'),
                                example: tr('MD para carga inicial, JSON para ajuste fino.', 'MD for initial load, JSON for fine-tuning.'),
                            },
                        ]}
                    />

                    <SectionHeading
                        icon={<Database className="h-6 w-6 text-primary" />}
                        title={tr('9) Cargas masivas auxiliares (temas, alias, feedbacks)', '9) Auxiliary bulk loads (topics, aliases, feedbacks)')}
                        subtitle={tr(
                            'Formatos de texto para no editar uno por uno.',
                            'Text formats to avoid one-by-one manual editing.',
                        )}
                    />

                    <CodeExample
                        title={tr('Temas (textarea de carga masiva)', 'Topics (bulk textarea)')}
                        code={`Tema A
Tema B
Tema C`}
                    />

                    <CodeExample
                        title={tr('Alias por tema (Tema: alias1, alias2)', 'Aliases by topic (Topic: alias1, alias2)')}
                        code={`Tema A: alias_a1, alias_a2, alias_a3
Tema B: alias_b1, alias_b2`}
                    />

                    <CodeExample
                        title={tr('Feedback por tema (Tema: mensaje)', 'Topic feedback (Topic: message)')}
                        code={`Tema A: Tu tema detectado es Tema A. Estas son las reglas aplicables...
Tema B: Tu tema detectado es Tema B. Estas son las reglas aplicables...`}
                    />

                    <SectionHeading
                        icon={<Rocket className="h-6 w-6 text-primary" />}
                        title={tr('10) Configuración de selección (standard vs sequence)', '10) Selection settings (standard vs sequence')}
                        subtitle={tr(
                            'Qué hace cada control para armar el examen final.',
                            'What each control does when building the final exam.',
                        )}
                    />

                    <Rows
                        rows={[
                            { field: 'mode=standard', purpose: tr('Arma examen por cantidades (obligatorias + aleatorias).', 'Builds exam by counts (mandatory + random).'), example: tr('Muy útil para exámenes dinámicos.', 'Best for dynamic exams.') },
                            { field: 'mode=sequence', purpose: tr('Arma examen por playlist exacta.', 'Builds exam by exact playlist.'), example: tr('Ideal para flujos cerrados guionados.', 'Ideal for scripted closed flows.') },
                            { field: 'mandatory_count', purpose: tr('Cuántas preguntas obligatorias toma.', 'How many mandatory questions to take.'), example: '2' },
                            { field: 'random_count', purpose: tr('Cuántas preguntas no obligatorias toma al azar.', 'How many non-mandatory questions to sample randomly.'), example: '3' },
                            { field: 'order_mode', purpose: tr('Orden entre obligatorias y aleatorias.', 'Ordering between mandatory and random.'), example: 'mandatory_first | random_first | mixed' },
                            { field: 'question_type_order', purpose: tr('Orden interno por tipo (`teorica`/`practica`).', 'Internal ordering by type (`teorica`/`practica`).'), example: 'teorica_first' },
                            { field: 'show_question_counter', purpose: tr('Muestra/oculta contador "Pregunta X/Y".', 'Shows/hides the "Question X/Y" counter.'), example: 'false' },
                            { field: 'semantic_mode', purpose: tr('Define cuándo invocar evaluación semántica LLM.', 'Defines when to invoke LLM semantic evaluation.'), example: 'ambiguous_only | always' },
                            { field: 'by_topic', purpose: tr('Filtra por tema detectado (si hay router activo).', 'Filters by detected topic (if router is enabled).'), example: 'true' },
                        ]}
                    />

                    <CodeExample
                        title={tr('Ejemplo de secuencia (playlist)', 'Sequence example (playlist)')}
                        code={`[
  { "id": "s1", "type": "specific", "question_id": "intro_q_001", "count": 1 },
  { "id": "s2", "type": "random_topic", "topic": "Tema A", "count": 2 },
  { "id": "s3", "type": "random_pool", "pool_ids": ["p001","p002","p003"], "count": 1 }
]`}
                    />

                    <SectionHeading
                        icon={<CheckCircle2 className="h-6 w-6 text-primary" />}
                        title={tr('11) Checklist operacional para bancos muy grandes (ej. 520 preguntas)', '11) Operational checklist for very large banks (e.g. 520 questions)')}
                        subtitle={tr(
                            'Práctica recomendada para evitar errores humanos y regressions.',
                            'Recommended practice to avoid human mistakes and regressions.',
                        )}
                    />

                    <Process
                        steps={[
                            tr('1) Curá contenido fuera del editor (MD/JSON).', '1) Curate content outside the editor (MD/JSON).'),
                            tr('2) Importá todo junto y validá cantidad total por tema.', '2) Import all at once and validate total by topic.'),
                            tr('3) Ajustá en JSON campos repetitivos (`continue_mode`, `max_attempts`, templates).', '3) Tune repetitive fields in JSON (`continue_mode`, `max_attempts`, templates).'),
                            tr('4) En UI usá colapsar/expandir y filtro por tipo para revisar solo muestras.', '4) In UI use collapse/expand and type filter to review only samples.'),
                            tr('5) Probá en Staging: tema correcto, reintentos, descansos, cierre 2 pasos.', '5) Test in Staging: correct topic, retries, intermissions, 2-step close.'),
                            tr('6) Publicá en Prod solo con snapshot previo.', '6) Publish to Prod only after snapshot backup.'),
                        ]}
                    />

                    <Callout
                        title={tr('Dato de arquitectura (persistencia)', 'Architecture note (persistence)')}
                        text={tr(
                            'El banco es local por bot y se guarda en la configuración del bot en Supabase. No hay banco administrado compartido activo en esta estrategia.',
                            'The bank is local per bot and stored in the bot configuration in Supabase. There is no active shared managed bank in this strategy.',
                        )}
                    />
                </div>
            ),
        },
        {
            id: 'detector',
            label: tr('6. Estrategia DETECTOR (Guía Maestra)', '6. DETECTOR Strategy (Master Guide)'),
            icon: <ClipboardList className="h-4 w-4" />,
            render: () => (
                <div className="space-y-8">
                    <SectionHeading
                        icon={<ClipboardList className="h-8 w-8 text-primary" />}
                        title={tr('Estrategia: DETECTOR (Manual Operativo Ultra Detallado)', 'Strategy: DETECTOR (Ultra Detailed Operational Manual)')}
                        subtitle={tr(
                            'Esta guía documenta cada campo, botón, selector, variable y comportamiento del Detector. Si está en pantalla o en runtime, está explicado acá.',
                            'This guide documents every Detector field, button, selector, variable, and runtime behavior. If it exists on screen or in runtime, it is explained here.',
                        )}
                    />

                    <Grid>
                        <InfoCard
                            title={tr('Qué sí hace', 'What it does')}
                            body={tr(
                                'Audita condiciones puntuales paso a paso: evidencia textual (keywords) y evidencia visual (IA de visión), generando hallazgos con severidad y veredicto final.',
                                'It audits specific conditions step by step: text evidence (keywords) and visual evidence (vision AI), generating findings with severity and a final verdict.',
                            )}
                        />
                        <InfoCard
                            title={tr('Qué no hace', 'What it does not do')}
                            body={tr(
                                'No es un chat libre ni un simulador de conversación abierta. Es un flujo dirigido por pasos. Si necesitás diálogo libre, usá SIMULATOR o GENERIC.',
                                'It is not a free chat or open conversation simulator. It is a step-driven flow. If you need free dialogue, use SIMULATOR or GENERIC.',
                            )}
                        />
                    </Grid>

                    <Callout
                        title={tr('Mapa mental recomendado', 'Recommended mental model')}
                        text={tr(
                            'Pensalo como una inspección guiada digital: cada paso solicita una evidencia, la evalúa y decide si continúa, observa o bloquea.',
                            'Think of it as a guided digital inspection: each step requests evidence, evaluates it, and decides whether to continue, warn, or block.',
                        )}
                    />

                    <SectionHeading
                        icon={<ListChecks className="h-6 w-6 text-primary" />}
                        title={tr('1) Flujo de ejecución completo (de punta a punta)', '1) Full execution flow (end to end)')}
                        subtitle={tr(
                            'Qué ocurre internamente desde que el usuario envía un mensaje hasta que se produce el veredicto.',
                            'What happens internally from user input to final verdict.',
                        )}
                    />

                    <Process
                        steps={[
                            tr('1) Se carga estado de sesión (`detector_state`) desde metadata. Si no existe, se inicializa.', '1) Session state (`detector_state`) is loaded from metadata. If absent, it is initialized.'),
                            tr('2) Se localiza el paso actual (`currentStepIndex`) y se saltean pasos cuyo `run_if` no cumple.', '2) Current step (`currentStepIndex`) is resolved and steps whose `run_if` does not match are skipped.'),
                            tr('3) Si no quedan pasos, se genera veredicto final.', '3) If no steps remain, final verdict is generated.'),
                            tr('4) Si es primer contacto del paso (`stepAttempts = 0`), el bot solo envía la instrucción del paso.', '4) On first contact of the step (`stepAttempts = 0`), the bot only sends step instruction.'),
                            tr('5) En respuestas siguientes, evalúa según tipo (`text` o `image`).', '5) On next responses, it evaluates by type (`text` or `image`).'),
                            tr('6) Registra hallazgos, avanza de paso, o bloquea según severidad y configuración.', '6) It records findings, advances, or blocks based on severity and configuration.'),
                            tr('7) Se guarda estado actualizado en metadata y se auditan tokens/costo.', '7) Updated state is saved in metadata and token/cost audit is stored.'),
                        ]}
                    />

                    <SectionHeading
                        icon={<Settings2 className="h-6 w-6 text-primary" />}
                        title={tr('2) Panel Detector en Strategy Fields: control por control', '2) Detector panel in Strategy Fields: control by control')}
                        subtitle={tr(
                            'Todo lo que aparece en la tarjeta de "Configuración de Detector" y qué efecto real produce.',
                            'Everything shown in "Detector Configuration" and its real effect.',
                        )}
                    />

                    <Rows
                        rows={[
                            {
                                field: 'detection_criteria',
                                purpose: tr('Prompt global de visión. Se usa como fallback en pasos de imagen que no tengan `criteria` propio.', 'Global vision prompt. Used as fallback for image steps without their own `criteria`.'),
                                example: tr('Analizar si la imagen es correcta y segura.', 'Analyze whether image is correct and safe.'),
                            },
                            {
                                field: 'detector_options.reference_mode',
                                purpose: tr('Política general de referencias visuales. Valores: `single_priority`, `step_flags`, `none`.', 'Global visual reference policy. Values: `single_priority`, `step_flags`, `none`.'),
                                example: 'single_priority',
                            },
                            {
                                field: 'detector_options.include_reference_in_final_report',
                                purpose: tr('Permite incluir una referencia visual en salida final si existe URL de ejemplo relevante.', 'Allows including one visual reference in final output when relevant example URL exists.'),
                                example: 'true',
                            },
                            {
                                field: 'detector_options.verdict_labels.habilitado',
                                purpose: tr('Etiqueta textual para veredicto verde.', 'Text label for green verdict.'),
                                example: 'HABILITADO',
                            },
                            {
                                field: 'detector_options.verdict_labels.habilitado_con_observaciones',
                                purpose: tr('Etiqueta textual para veredicto amarillo.', 'Text label for yellow verdict.'),
                                example: 'HABILITADO CON OBSERVACIONES',
                            },
                            {
                                field: 'detector_options.verdict_labels.no_habilitado',
                                purpose: tr('Etiqueta textual para veredicto rojo.', 'Text label for red verdict.'),
                                example: 'NO HABILITADO',
                            },
                            {
                                field: 'detector_options.verdict_labels.informacion_insuficiente',
                                purpose: tr('Etiqueta textual cuando no hay evidencia suficiente.', 'Text label when there is not enough evidence.'),
                                example: 'INFORMACIÓN INSUFICIENTE',
                            },
                            {
                                field: 'detector_options.final_verdict_template',
                                purpose: tr('Plantilla editable del cierre final. Si tiene contenido, el chat final muestra SOLO esta plantilla renderizada.', 'Editable final closing template. If it has content, final chat output shows ONLY this rendered template.'),
                                example: 'Luego de verificar..., el veredicto es {veredicto}.',
                            },
                            {
                                field: 'detector_options.correction_reclassify_enabled',
                                purpose: tr('Si el usuario corrige por texto un hallazgo previo, permite reclasificar automáticamente a CRITICAL.', 'If user text-corrects a previous finding, allows automatic reclassification to CRITICAL.'),
                                example: 'true',
                            },
                            {
                                field: 'detector_options.correction_requires_new_image',
                                purpose: tr('Al reclasificar por corrección, solicita nueva imagen de detalle para revalidar en campo.', 'After correction-based reclassification, requests a new detail image for field revalidation.'),
                                example: 'true',
                            },
                            {
                                field: 'detector_options.correction_patterns',
                                purpose: tr('Frases personalizadas (coma separada) que activan intención de corrección del usuario.', 'Custom comma-separated phrases that trigger user correction intent.'),
                                example: tr('en realidad, eso está mal, te corrijo', 'actually, that is wrong, correction'),
                            },
                        ]}
                    />

                    <SectionHeading
                        icon={<MessageSquare className="h-6 w-6 text-primary" />}
                        title={tr('3) Plantilla de veredicto final: modo estricto, variables y ejemplos', '3) Final verdict template: strict mode, variables, and examples')}
                        subtitle={tr(
                            'La plantilla no es decorativa: define exactamente qué sale al final cuando está cargada.',
                            'The template is not decorative: it defines exactly what final output is shown when filled.',
                        )}
                    />

                    <Callout
                        title={tr('Regla operativa crítica', 'Critical operational rule')}
                        text={tr(
                            'Si `final_verdict_template` tiene texto, se omite el bloque automático (`REPORTE FINAL`, severidad, hallazgos, etc.) y se devuelve únicamente tu texto renderizado con variables.',
                            'If `final_verdict_template` has text, the automatic block (`FINAL REPORT`, severity, findings, etc.) is omitted and only your rendered template text is returned.',
                        )}
                    />

                    <Rows
                        rows={[
                            { field: '{veredicto}', purpose: tr('Etiqueta final según reglas de severidad y bloqueo.', 'Final label based on severity and block rules.'), example: 'NO HABILITADO' },
                            { field: '{verdict_key}', purpose: tr('Clave interna del veredicto.', 'Internal verdict key.'), example: 'no_habilitado' },
                            { field: '{severidad_global}', purpose: tr('Severidad consolidada: CRITICAL, WARNING, UNCERTAIN u OK.', 'Consolidated severity: CRITICAL, WARNING, UNCERTAIN, or OK.'), example: 'CRITICAL' },
                            { field: '{hallazgos_total}', purpose: tr('Cantidad total de hallazgos registrados.', 'Total number of recorded findings.'), example: '3' },
                            { field: '{hallazgos_critical}', purpose: tr('Cantidad de hallazgos críticos.', 'Number of critical findings.'), example: '1' },
                            { field: '{hallazgos_warning}', purpose: tr('Cantidad de hallazgos con observación.', 'Number of warning findings.'), example: '1' },
                            { field: '{hallazgos_uncertain}', purpose: tr('Cantidad de hallazgos inciertos.', 'Number of uncertain findings.'), example: '0' },
                            { field: '{hallazgos_ok}', purpose: tr('Cantidad de hallazgos conformes.', 'Number of OK findings.'), example: '1' },
                            { field: '{hallazgos_no_ok}', purpose: tr('Resumen lineal de no conformidades.', 'Linear summary of non-OK findings.'), example: tr('Paso X: CRITICAL (... ) | Paso Y: WARNING (... )', 'Step X: CRITICAL (... ) | Step Y: WARNING (... )') },
                            { field: '{hallazgos_ok_detalle}', purpose: tr('Resumen lineal de hallazgos OK.', 'Linear summary of OK findings.'), example: tr('Paso Z: Cumple criterio', 'Step Z: Meets criteria') },
                            { field: '{datos_relevados}', purpose: tr('Dump textual de `state.data` (variables capturadas en pasos).', 'Text dump of `state.data` (variables captured in steps).'), example: '- scaffold_type: movil' },
                            { field: '{proximo_paso}', purpose: tr('Recomendación completa de acción según veredicto.', 'Full recommendation message based on verdict.'), example: tr('No habilitar la tarea hasta corregir...', 'Do not enable task until correcting...') },
                            { field: '{proxima_accion}', purpose: tr('Versión corta y gramaticalmente amigable para insertar en frases.', 'Short version suitable to embed inside sentences.'), example: tr('corregir observaciones antes de continuar', 'correct observations before continuing') },
                            { field: '{referencia_visual}', purpose: tr('URL de referencia visual seleccionada si corresponde (solo si está habilitado).', 'Selected visual reference URL when applicable (only if enabled).'), example: 'https://.../critical.png' },
                            { field: '{data.<id_del_paso>}', purpose: tr('Valor exacto guardado por un paso de texto. `<id_del_paso>` es el Step ID.', 'Exact value stored by a text step. `<id_del_paso>` is the Step ID.'), example: '{data.scaffold_type}' },
                            { field: '{var.<id_del_paso>}', purpose: tr('Alias equivalente de `{data.<id_del_paso>}`.', 'Alias equivalent of `{data.<step_id>}`.'), example: '{var.scaffold_type}' },
                        ]}
                    />

                    <CodeExample
                        title={tr('Plantilla recomendada para copy natural', 'Recommended template for natural copy')}
                        code={`Luego de verificar el estado de tu andamio, el veredicto es {veredicto}.
Te recomendamos {proxima_accion}.
Hallazgos críticos: {hallazgos_critical}.
Referencia (si aplica): {referencia_visual}
Recuerda que este veredicto no reemplaza la inspección humana.`}
                    />

                    <SectionHeading
                        icon={<Workflow className="h-6 w-6 text-primary" />}
                        title={tr('4) DetectionStepEditor: anatomía completa de cada tarjeta de paso', '4) DetectionStepEditor: full anatomy of each step card')}
                        subtitle={tr(
                            'Cada paso tiene controles de estructura, entrada y comportamiento. Esta sección explica cada uno.',
                            'Each step has structure, input, and behavior controls. This section explains each one.',
                        )}
                    />

                    <Rows
                        rows={[
                            { field: 'Agregar Paso', purpose: tr('Crea un paso nuevo con ID autogenerado (`step_n`) y tipo `text` por defecto.', 'Creates a new step with auto-generated ID (`step_n`) and default `text` type.'), example: 'step_1' },
                            { field: 'Flechas subir/bajar', purpose: tr('Reordena pasos. El orden define la secuencia real de ejecución.', 'Reorders steps. Order defines actual runtime sequence.'), example: tr('Mover inspección general antes de detalle.', 'Move general inspection before detail.') },
                            { field: 'Eliminar paso', purpose: tr('Quita el paso y reindexa ordenes internos.', 'Removes step and reindexes internal ordering.'), example: tr('Borrar paso redundante.', 'Delete redundant step.') },
                            { field: 'step.id', purpose: tr('Identificador técnico único. Se usa para guardar datos y en `run_if.var`.', 'Unique technical identifier. Used to store data and in `run_if.var`.'), example: 'scaffold_type' },
                            { field: 'normalización de step.id', purpose: tr('Al perder foco, el editor sanitiza el ID: minúsculas, sin acentos, `_` como separador, y evita duplicados agregando sufijo.', 'On blur, editor sanitizes ID: lowercase, no accents, `_` separator, and avoids duplicates by appending suffix.'), example: 'Scaffold Type -> scaffold_type' },
                            { field: 'step.instruction', purpose: tr('Texto que se le muestra al usuario para pedir evidencia.', 'Text shown to user to request evidence.'), example: tr('Subí una foto lateral completa del andamio.', 'Upload a complete side photo of the scaffold.') },
                            { field: 'step.example_image_url', purpose: tr('Imagen de referencia opcional mostrable en warnings/bloqueos/dudosos y cierre final.', 'Optional reference image URL, usable in warnings/blocks/uncertain and final output.'), example: 'https://.../ejemplo_ok.png' },
                            { field: 'step.type', purpose: tr('Define motor de evaluación: `text` (keywords) o `image` (visión).', 'Defines evaluation engine: `text` (keywords) or `image` (vision).'), example: 'image' },
                            { field: 'step.required (avanzado)', purpose: tr('Campo existente en schema/runtime. Controla si fallo o ausencia de evidencia bloquea/repregunta o solo registra WARNING y continúa. Hoy no tiene toggle dedicado en esta UI.', 'Existing schema/runtime field. Controls whether missing/invalid evidence blocks or only records WARNING and continues. It currently has no dedicated toggle in this UI.'), example: 'true | false (vía JSON/Pro Mode)' },
                        ]}
                    />

                    <SectionHeading
                        icon={<MessageSquare className="h-6 w-6 text-primary" />}
                        title={tr('5) Paso tipo TEXT: comportamiento exacto', '5) TEXT step: exact behavior')}
                        subtitle={tr(
                            'Cómo decide el motor si una respuesta textual habilita avanzar.',
                            'How engine decides whether text response can advance.',
                        )}
                    />

                    <Rows
                        rows={[
                            { field: 'keywords[]', purpose: tr('Si hay keywords, alcanza con que la respuesta incluya al menos una (match por includes, no regex).', 'If keywords exist, any one contained in response is enough (includes match, not regex).'), example: '["movil", "móvil"]' },
                            { field: 'keywords vacías', purpose: tr('Si no hay keywords, cualquier texto no vacío se considera válido.', 'If keywords are empty, any non-empty text is considered valid.'), example: tr('Usuario escribe cualquier cosa no vacía y avanza.', 'User writes any non-empty text and advances.') },
                            { field: 'guardado en data', purpose: tr('Si valida, se guarda `state.data[step.id] = respuesta` para usar luego.', 'When valid, stores `state.data[step.id] = response` for later usage.'), example: 'data.scaffold_type = "movil"' },
                            { field: 'texto inválido + required=true', purpose: tr('No avanza y repregunta: "No entendí. <instrucción>".', 'Does not advance and asks again: "No entendí. <instruction>".'), example: tr('No entendí. ¿Es fijo o móvil?', 'No entendí. Is it fixed or mobile?') },
                            { field: 'texto inválido + required=false', purpose: tr('Registra WARNING y continúa al siguiente paso.', 'Registers WARNING and continues to next step.'), example: tr('No se pudo validar el paso opcional...', 'Could not validate optional step...') },
                        ]}
                    />

                    <SectionHeading
                        icon={<FileText className="h-6 w-6 text-primary" />}
                        title={tr('6) Condición de ejecución (`run_if`): mini-motor condicional', '6) Run condition (`run_if`): conditional mini engine')}
                        subtitle={tr(
                            'Permite ejecutar un paso solo si otra variable de sesión cumple una regla.',
                            'Allows running a step only if another session variable satisfies a rule.',
                        )}
                    />

                    <Rows
                        rows={[
                            { field: 'run_if.var', purpose: tr('Nombre de variable fuente (normalmente un `step.id` previo).', 'Source variable name (usually a previous `step.id`).'), example: 'scaffold_type' },
                            { field: 'run_if.operator = equals', purpose: tr('Compara igualdad exacta normalizada (sin acentos/mayúsculas).', 'Compares normalized exact equality (accent and case insensitive).'), example: 'movil' },
                            { field: 'run_if.operator = contains_any', purpose: tr('Evalúa si la variable contiene cualquiera de los valores listados.', 'Checks whether variable contains any listed value.'), example: 'movil, con ruedas' },
                            { field: 'run_if.operator = in', purpose: tr('Evalúa membresía exacta en lista normalizada.', 'Checks exact membership in normalized list.'), example: 'fijo, movil' },
                            { field: 'si no cumple', purpose: tr('El paso se saltea silenciosamente y no consume turno del usuario.', 'Step is silently skipped and does not consume user turn.'), example: tr('Paso exclusivo para andamio móvil.', 'Step only for mobile scaffold.') },
                        ]}
                    />

                    <CodeExample
                        title={tr('Ejemplo completo de `run_if`', 'Full `run_if` example')}
                        code={`{
  "id": "foto_ruedas",
  "type": "image",
  "instruction": "Subí una foto de las ruedas",
  "run_if": {
    "var": "scaffold_type",
    "operator": "contains_any",
    "values": ["movil", "móvil"]
  }
}`}
                    />

                    <SectionHeading
                        icon={<Brain className="h-6 w-6 text-primary" />}
                        title={tr('7) Paso tipo IMAGE: campo por campo y semáforo operativo', '7) IMAGE step: field-by-field and traffic-light operation')}
                        subtitle={tr(
                            'Esta es la parte más crítica del Detector: visión, severidades y políticas de bloqueo.',
                            'This is the most critical part of Detector: vision, severities, and blocking policies.',
                        )}
                    />

                    <Rows
                        rows={[
                            { field: 'criteria', purpose: tr('Prompt específico enviado al modelo de visión para este paso.', 'Step-specific prompt sent to vision model.'), example: tr('Verificar guardapié completo y plataforma firme.', 'Verify complete toe board and stable platform.') },
                            { field: 'feedback_ok', purpose: tr('Mensaje opcional cuando severidad = OK. Si está vacío, puede quedar silencioso.', 'Optional message when severity = OK. If empty, may remain silent.'), example: tr('Correcto, condición conforme.', 'Correct, condition compliant.') },
                            { field: 'feedback_warn', purpose: tr('Mensaje para WARNING. Soporta variable `{explanation}`.', 'Message for WARNING. Supports `{explanation}` variable.'), example: tr('Observación: {explanation}', 'Observation: {explanation}') },
                            { field: 'show_ref_on_warn', purpose: tr('Si está activo y hay `example_image_url`, agrega imagen de referencia en WARNING.', 'If enabled and `example_image_url` exists, adds reference image in WARNING.'), example: 'true' },
                            { field: 'feedback_block', purpose: tr('Mensaje para CRITICAL. Soporta `{explanation}`.', 'Message for CRITICAL. Supports `{explanation}`.'), example: tr('Bloqueo: {explanation}', 'Block: {explanation}') },
                            { field: 'show_ref_on_block', purpose: tr('Si está activo, muestra referencia visual en bloqueos.', 'If enabled, shows visual reference on blocks.'), example: 'true' },
                            { field: 'allow_critical_retry', purpose: tr('Permite 1 reintento máximo en CRITICAL antes de bloquear definitivamente.', 'Allows up to 1 CRITICAL retry before definitive block.'), example: 'true' },
                            { field: 'on_critical', purpose: tr('Decide política tras CRITICAL confirmado: `block` o `continue_flagged`.', 'Decides policy after confirmed CRITICAL: `block` or `continue_flagged`.'), example: 'continue_flagged' },
                            { field: 'feedback_uncertain', purpose: tr('Mensaje para UNCERTAIN (foto poco clara).', 'Message for UNCERTAIN (unclear photo).'), example: tr('No se distingue bien, reenviá con mejor luz.', 'Not clear enough, resend with better light.') },
                            { field: 'show_ref_on_uncertain', purpose: tr('Permite mostrar imagen de referencia también en incierto.', 'Allows showing reference image in uncertain outcomes.'), example: 'false' },
                            { field: 'sin imagen + required=true', purpose: tr('Si el paso requiere imagen y el usuario no adjunta ninguna, el motor no avanza y pide subir imagen.', 'If step requires image and user uploads none, engine does not advance and asks for image upload.'), example: tr('Por favor subí la imagen requerida para continuar.', 'Please upload required image to continue.') },
                            { field: 'sin imagen + required=false', purpose: tr('Registra WARNING automático por paso opcional sin imagen y sigue flujo.', 'Automatically records WARNING for optional step without image and continues flow.'), example: tr('No se adjuntó imagen en un paso opcional.', 'No image attached in an optional step.') },
                            { field: 'CRITICAL en paso opcional', purpose: tr('Si el paso es opcional, un CRITICAL de visión se degrada a WARNING para no bloquear por evidencia opcional.', 'If step is optional, a vision CRITICAL is downgraded to WARNING to avoid blocking on optional evidence.'), example: 'CRITICAL -> WARNING' },
                        ]}
                    />

                    <Grid>
                        <InfoCard
                            title="OK"
                            body={tr(
                                'Registra hallazgo OK y avanza. Si hay `feedback_ok`, lo muestra.',
                                'Registers OK finding and advances. If `feedback_ok` exists, it is shown.',
                            )}
                        />
                        <InfoCard
                            title="WARNING"
                            body={tr(
                                'Registra observación y continúa. Puede anexar referencia visual según flags.',
                                'Registers warning and continues. May append visual reference according to flags.',
                            )}
                        />
                        <InfoCard
                            title="CRITICAL"
                            body={tr(
                                'Dispara doble chequeo supervisor. Si queda CRITICAL y `on_critical=block`, cierra sesión con veredicto final.',
                                'Triggers supervisor double-check. If still CRITICAL and `on_critical=block`, session ends with final verdict.',
                            )}
                        />
                        <InfoCard
                            title="UNCERTAIN"
                            body={tr(
                                'Si el paso es requerido, pide reintento hasta 3 intentos; luego degrada a WARNING. Si el paso es opcional, pasa directo a WARNING.',
                                'If required step, requests retry up to 3 attempts, then degrades to WARNING. If optional, directly treated as WARNING.',
                            )}
                        />
                    </Grid>

                    <SectionHeading
                        icon={<ShieldCheck className="h-6 w-6 text-primary" />}
                        title={tr('8) Doble chequeo supervisor y normalización de severidad', '8) Supervisor double-check and severity normalization')}
                        subtitle={tr(
                            'Mecanismos para reducir falsos bloqueos y tolerar respuestas heterogéneas del modelo.',
                            'Mechanisms to reduce false blocks and tolerate heterogeneous model outputs.',
                        )}
                    />

                    <Rows
                        rows={[
                            {
                                field: 'Supervisor Mode',
                                purpose: tr('Todo CRITICAL del analista inicial se revalida con un segundo prompt supervisor más estricto.', 'Every initial CRITICAL is revalidated with a stricter supervisor prompt.'),
                                example: tr('Puede bajar de CRITICAL a WARNING si hay duda.', 'Can downgrade from CRITICAL to WARNING if uncertain.'),
                            },
                            {
                                field: 'Normalización robusta',
                                purpose: tr('El motor interpreta variantes como `critico`, `rojo`, `warn`, `aprobado`, `dudoso` y las mapea a severidad estándar.', 'Engine interprets variants like `critico`, `rojo`, `warn`, `aprobado`, `dudoso` and maps them to standard severity.'),
                                example: 'CRITICAL | WARNING | OK | UNCERTAIN',
                            },
                            {
                                field: 'Fallback ante error del modelo',
                                purpose: tr('Si falla el análisis de visión (API/error JSON), se registra como UNCERTAIN con explicación de error.', 'If vision analysis fails (API/JSON error), it is treated as UNCERTAIN with error explanation.'),
                                example: tr('Error al analizar imagen: ...', 'Error analyzing image: ...'),
                            },
                        ]}
                    />

                    <SectionHeading
                        icon={<ListChecks className="h-6 w-6 text-primary" />}
                        title={tr('9) Reglas exactas de veredicto global (motor)', '9) Exact global verdict rules (engine)')}
                        subtitle={tr(
                            'Cómo decide el sistema la etiqueta final antes de renderizar template o reporte.',
                            'How system decides final label before rendering template or report.',
                        )}
                    />

                    <Rows
                        rows={[
                            { field: 'NO HABILITADO', purpose: tr('Se activa si `state.blocked=true` o existe al menos un hallazgo CRITICAL.', 'Triggered when `state.blocked=true` or at least one CRITICAL finding exists.'), example: tr('Cualquier bloqueo crítico confirmado.', 'Any confirmed critical block.') },
                            { field: 'INFORMACIÓN INSUFICIENTE', purpose: tr('Se activa si no hay hallazgos o solo hay inciertos sin warnings ni OK.', 'Triggered when there are no findings or only uncertain findings without warnings or OK.'), example: tr('No hubo evidencia suficiente para decidir.', 'Not enough evidence to decide.') },
                            { field: 'HABILITADO CON OBSERVACIONES', purpose: tr('Se activa cuando hay WARNING o UNCERTAIN junto con evidencia no bloqueante.', 'Triggered when WARNING or UNCERTAIN exists with non-blocking evidence.'), example: tr('Hay desvíos menores o dudas, sin bloqueo crítico.', 'Minor deviations or doubts, without critical block.') },
                            { field: 'HABILITADO', purpose: tr('Se activa cuando todos los hallazgos son OK.', 'Triggered when all findings are OK.'), example: tr('Cumplimiento completo sin observaciones.', 'Complete compliance without observations.') },
                        ]}
                    />

                    <SectionHeading
                        icon={<RotateCcw className="h-6 w-6 text-primary" />}
                        title={tr('10) Corrección del usuario y reclasificación automática', '10) User correction and automatic reclassification')}
                        subtitle={tr(
                            'Qué pasa cuando el usuario contradice una evaluación previa (ej: "eso está mal").',
                            'What happens when user contradicts a previous evaluation (e.g., "that is wrong").',
                        )}
                    />

                    <Rows
                        rows={[
                            {
                                field: 'disparador de corrección',
                                purpose: tr('Se activa si el mensaje contiene señales por defecto o patrones personalizados en `correction_patterns`.', 'Triggered when message contains default signals or custom `correction_patterns`.'),
                                example: tr('en realidad, eso está mal, te corrijo', 'actually, that is wrong, correction'),
                            },
                            {
                                field: 'qué reclasifica',
                                purpose: tr('Toma el último hallazgo no crítico y lo sube a CRITICAL, agregando trazabilidad de corrección del usuario.', 'Takes latest non-critical finding and upgrades it to CRITICAL with user-correction traceability.'),
                                example: tr('... | Corrección del usuario: ...', '... | User correction: ...'),
                            },
                            {
                                field: 'correction_requires_new_image',
                                purpose: tr('Si está activo y no bloquea inmediatamente, pide una nueva foto de detalle para validar la corrección.', 'If enabled and not blocked immediately, asks for a new detail image to validate correction.'),
                                example: tr('Por favor subí una nueva foto de detalle...', 'Please upload a new detail photo...'),
                            },
                            {
                                field: 'bloqueo por corrección',
                                purpose: tr('Si el paso afectado tiene `on_critical=block`, la reclasificación termina sesión y dispara salida final.', 'If affected step has `on_critical=block`, reclassification ends session and triggers final output.'),
                                example: tr('Respuesta = feedback de bloqueo + cierre final.', 'Response = block feedback + final closure.'),
                            },
                        ]}
                    />

                    <SectionHeading
                        icon={<Code2 className="h-6 w-6 text-primary" />}
                        title={tr('11) JSON de referencia completo para DETECTOR', '11) Complete DETECTOR reference JSON')}
                        subtitle={tr(
                            'Plantilla integral para Pro Mode o para revisión técnica de configuración.',
                            'Comprehensive template for Pro Mode or technical configuration review.',
                        )}
                    />

                    <CodeExample
                        title={tr('Ejemplo canónico (campos principales)', 'Canonical example (main fields)')}
                        code={`{
  "detection_criteria": "Regla global de validación visual...",
  "detector_options": {
    "reference_mode": "single_priority",
    "include_reference_in_final_report": true,
    "correction_reclassify_enabled": true,
    "correction_requires_new_image": true,
    "correction_patterns": ["en realidad", "eso está mal", "te corrijo"],
    "verdict_labels": {
      "habilitado": "HABILITADO",
      "habilitado_con_observaciones": "HABILITADO CON OBSERVACIONES",
      "no_habilitado": "NO HABILITADO",
      "informacion_insuficiente": "INFORMACIÓN INSUFICIENTE"
    },
    "final_verdict_template": "Luego de verificar..., el veredicto es {veredicto}. Te recomendamos {proxima_accion}."
  },
  "detection_steps": [
    {
      "id": "scaffold_type",
      "order": 0,
      "type": "text",
      "instruction": "¿El andamio es fijo o móvil?",
      "required": true,
      "keywords": ["fijo", "movil", "móvil"]
    },
    {
      "id": "macro_lateral",
      "order": 1,
      "type": "image",
      "instruction": "Subí una foto lateral completa.",
      "required": true,
      "criteria": "Validar plataforma, barandas y guardapié.",
      "example_image_url": "https://.../andamio_ok.png",
      "feedback_ok": "Correcto, condición conforme.",
      "feedback_warn": "Observación: {explanation}",
      "feedback_block": "Bloqueo: {explanation}",
      "feedback_uncertain": "No se distingue bien. Repetí la foto con mejor luz.",
      "show_ref_on_warn": true,
      "show_ref_on_block": true,
      "show_ref_on_uncertain": false,
      "allow_critical_retry": true,
      "on_critical": "block"
    },
    {
      "id": "foto_ruedas",
      "order": 2,
      "type": "image",
      "instruction": "Subí una foto de ruedas y frenos.",
      "required": true,
      "run_if": {
        "var": "scaffold_type",
        "operator": "contains_any",
        "values": ["movil", "móvil"]
      }
    }
  ]
}`}
                    />

                    <SectionHeading
                        icon={<Rocket className="h-6 w-6 text-primary" />}
                        title={tr('12) Checklist de implementación y calidad (antes de publicar)', '12) Implementation and quality checklist (before publish)')}
                        subtitle={tr(
                            'Lista de control para evitar errores funcionales y de copy en producción.',
                            'Control list to avoid functional and copy errors in production.',
                        )}
                    />

                    <Process
                        steps={[
                            tr('1) Definí IDs de pasos estables (`snake_case`) porque alimentan `data.<id>` en templates y condiciones.', '1) Define stable step IDs (`snake_case`) because they feed `data.<id>` in templates and conditions.'),
                            tr('2) Verificá que cada paso de imagen tenga `criteria` concreto y verificable, no ambiguo.', '2) Ensure each image step has concrete and verifiable `criteria`, not ambiguous wording.'),
                            tr('3) Revisá `run_if` con casos reales para confirmar que no se salteen pasos por errores de texto.', '3) Validate `run_if` with real cases to ensure steps are not skipped by text mismatches.'),
                            tr('4) Si usás `final_verdict_template`, probá los 4 escenarios de cierre: habilitado, con observaciones, no habilitado e información insuficiente.', '4) If using `final_verdict_template`, test all 4 closing scenarios: enabled, with observations, not enabled, and insufficient information.'),
                            tr('5) Si querés insertar recomendación dentro de una oración, preferí `{proxima_accion}` en vez de `{proximo_paso}`.', '5) If embedding recommendation inside a sentence, prefer `{proxima_accion}` over `{proximo_paso}`.'),
                            tr('6) Verificá que las URLs de `example_image_url` estén accesibles; si no, el botón de referencia no aporta valor.', '6) Verify `example_image_url` URLs are accessible; otherwise reference rendering gives no value.'),
                            tr('7) Probá una conversación completa y luego una corrección en sitio para validar reclasificación.', '7) Test one full conversation and then an on-site correction to validate reclassification.'),
                            tr('8) Publicá solo después de confirmar que el copy final representa exactamente lo que querés mostrar al usuario final.', '8) Publish only after confirming final copy shows exactly what you want end users to see.'),
                        ]}
                    />

                    <Callout
                        title={tr('Resumen ejecutivo', 'Executive summary')}
                        text={tr(
                            'Detector combina estructura (pasos), evidencia (texto/imagen), criterio técnico (prompts), gobernanza (severidad/reintentos/bloqueo) y comunicación final (template). Si esos cinco bloques están bien calibrados, la estrategia queda robusta y auditable.',
                            'Detector combines structure (steps), evidence (text/image), technical criteria (prompts), governance (severity/retries/blocking), and final communication (template). If those five blocks are calibrated, strategy is robust and auditable.',
                        )}
                    />
                </div>
            ),
        },

        {
            id: 'rag',
            label: tr('7. RAG', '7. RAG'),
            icon: <FileSearch className="h-4 w-4" />,
            render: () => (
                <div className="space-y-8">
                    <SectionHeading
                        icon={<FileSearch className="h-8 w-8 text-primary" />}
                        title={tr('RAG', 'RAG')}
                        subtitle={tr(
                            'Manual ultra detallado de operación RAG: qué hace, dónde corre en cada estrategia, cómo se configura, cómo impacta en costo y cómo evitar errores de fiabilidad.',
                            'Ultra-detailed RAG operating manual: what it does, where it runs in each strategy, how to configure it, cost impact, and reliability safeguards.',
                        )}
                    />

                    <Callout
                        title={tr('Principio rector de este capítulo', 'Guiding principle of this chapter')}
                        text={tr(
                            'RAG no es un interruptor mágico: es una tubería de recuperación documental con decisiones de costo, latencia y precisión. Configurar mal RAG suele aumentar gasto y ruido sin mejorar respuestas. Configurar bien RAG mejora verdad, auditabilidad y control operativo.',
                            'RAG is not a magic toggle: it is a documentary retrieval pipeline with cost, latency, and precision tradeoffs. Misconfigured RAG usually increases spend/noise without improving responses. Well-configured RAG improves truthfulness, auditability, and operational control.',
                        )}
                    />

                    <Grid>
                        <InfoCard
                            title={tr('Qué es (y qué no es)', 'What it is (and what it is not)')}
                            body={tr(
                                'RAG busca evidencia en tus documentos y la inyecta al modelo antes de responder. No reemplaza diseño de flujo, ni instrucciones, ni validaciones determinísticas. Si una regla es contractual/obligatoria, no la delegues solo a RAG.',
                                'RAG retrieves evidence from your documents and injects it into the model before answering. It does not replace flow design, instructions, or deterministic validations. If a rule is contractual/mandatory, do not delegate it to RAG alone.',
                            )}
                        />
                        <InfoCard
                            title={tr('Vector Store (biblioteca real)', 'Vector Store (real library)')}
                            body={tr(
                                'Un Vector Store es la colección indexada de documentos para búsqueda. Si el bot no tiene IDs válidos (`vs_...`) o están vacíos/no listos, RAG no agrega valor y puede terminar respondiendo sin evidencia real.',
                                'A Vector Store is the indexed document collection used for search. If the bot lacks valid IDs (`vs_...`) or stores are empty/not ready, RAG adds no value and may end up answering without real evidence.',
                            )}
                        />
                    </Grid>

                    <SectionHeading
                        icon={<Database className="h-6 w-6 text-primary" />}
                        title={tr('Nomenclatura visual (UI) que usa este capítulo', 'Visual UI nomenclature used in this chapter')}
                        subtitle={tr(
                            'Desde aquí usamos los mismos nombres que ves en pantalla para evitar confusión entre interfaz y JSON.',
                            'From this point we use the same names you see on-screen to avoid UI/JSON confusion.',
                        )}
                    />

                    <Rows
                        rows={[
                            {
                                field: tr('Cerebro & Datos (RAG)', 'Brain & Data (RAG)'),
                                purpose: tr(
                                    'Tarjeta principal donde configurás `Modo RAG`, `Motor`, `IDs de Vector Store`, `Evidencia requerida` y presets.',
                                    'Main card where you configure `RAG Mode`, `Engine`, `Vector Store IDs`, `Evidence required`, and presets.',
                                ),
                                example: tr('Está en el editor de bots y en evaluadores como "Control de RAG".', 'It appears in bot editor and in evaluators as "RAG control".'),
                            },
                            {
                                field: tr('Modo RAG', 'RAG Mode'),
                                purpose: tr(
                                    'Opciones visibles: `Nunca`, `Siempre`, `Por paso`, `Solo evaluación`.',
                                    'Visible options: `Never`, `Always`, `By step`, `Evaluation only`.',
                                ),
                                example: tr('Equivale a `rag_config.mode`.', 'Maps to `rag_config.mode`.'),
                            },
                            {
                                field: tr('Modo RAG (en Evaluador)', 'RAG Mode (in Evaluator)'),
                                purpose: tr(
                                    'En el editor de evaluador las opciones visibles son `Nunca`, `Siempre`, `Solo evaluación` (sin `Por paso`).',
                                    'In evaluator editor, visible options are `Never`, `Always`, `Evaluation only` (without `By step`).',
                                ),
                                example: tr('Sigue guardándose en `rag_config.mode`.', 'Still stored in `rag_config.mode`.'),
                            },
                            {
                                field: tr('Motor', 'Engine'),
                                purpose: tr(
                                    'Opciones visibles: `Wrapper (controlado)` y `Platform (OpenAI)`.',
                                    'Visible options: `Wrapper (controlled)` and `Platform (OpenAI)`.',
                                ),
                                example: tr('Equivale a `rag_config.owner`.', 'Maps to `rag_config.owner`.'),
                            },
                            {
                                field: tr('RAG por paso', 'Per-step RAG'),
                                purpose: tr(
                                    'Panel dentro del editor de flujo para pasos LLM con `Activado`, `Propósito`, `Estrategia`, `Estricto`, `Top-K`, `Plantilla de consulta` y `Filtros de metadatos`.',
                                    'Panel inside flow editor for LLM steps with `Enabled`, `Purpose`, `Strategy`, `Strict`, `Top-K`, `Query Template`, and `Metadata Filters`.',
                                ),
                                example: tr('Internamente se guarda en `rag_action`.', 'Internally stored as `rag_action`.'),
                            },
                        ]}
                    />

                    <SectionHeading
                        icon={<Workflow className="h-6 w-6 text-primary" />}
                        title={tr('1. Ciclo real al usar Control de RAG (paso a paso)', '1. Real cycle when using RAG control (step by step)')}
                        subtitle={tr(
                            'Este es el orden operativo real del runtime cuando la UI de RAG está activa para ese contexto.',
                            'This is the real runtime order when the RAG UI is active for that context.',
                        )}
                    />

                    <Process
                        steps={[
                            tr('1) Se resuelve configuración efectiva: `Control de RAG` global + `RAG por paso` (si ese paso lo tiene activado).', '1) Effective config is resolved: global `RAG control` + `Per-step RAG` (if enabled on that step).'),
                            tr('2) Se decide si corre según `Modo RAG` (`Nunca/Siempre/Por paso/Solo evaluación`) y tipo de paso.', '2) Runtime decides execution based on `RAG Mode` (`Never/Always/By step/Evaluation only`) and step type.'),
                            tr('3) Se arma `query`: por defecto mensaje del usuario; si hay `query_template`, esa plantilla interpolada manda.', '3) `query` is built: default user message; if `query_template` exists, interpolated template takes precedence.'),
                            tr('4) Se combinan filtros (`metadata_filters`) y parámetros de recuperación (`top_k`, threshold, etc.).', '4) Filters (`metadata_filters`) and retrieval parameters (`top_k`, threshold, etc.) are merged.'),
                            tr('5) Se ejecuta retrieval por `Motor` (`Wrapper` o `Platform`).', '5) Retrieval executes through selected `Engine` (`Wrapper` or `Platform`).'),
                            tr('6) Se construye `evidence pack` con fragmentos y metadatos de evidencia.', '6) `Evidence pack` is built with retrieved snippets and metadata.'),
                            tr('7) Si `Evidencia requerida` está activa y no hay evidencia válida, la respuesta entra en camino seguro (sin inventar).', '7) If `Evidence required` is active and there is no valid evidence, response switches to safe path (no hallucination).'),
                            tr('8) Si hay evidencia, se inyecta en instrucciones y se llama al modelo.', '8) If evidence exists, it is injected into instructions and the model is called.'),
                            tr('9) Se guardan trazas (`rag_traces`) y, en runtime, métricas de prompt (`llm_prompt_traces`).', '9) Traces are persisted (`rag_traces`) and, at runtime, prompt metrics (`llm_prompt_traces`).'),
                            tr('10) Se registra costo/tokens y se persiste estado de sesión.', '10) Token/cost accounting is stored and session state is persisted.'),
                        ]}
                    />

                    <SectionHeading
                        icon={<GitBranch className="h-6 w-6 text-primary" />}
                        title={tr('2. Dónde corre RAG según estrategia', '2. Where RAG runs by strategy')}
                        subtitle={tr(
                            'Mapa de ejecución real por tipo de bot. Esta parte es clave para no asumir comportamientos.',
                            'Real execution map by bot type. This is key to avoid incorrect assumptions.',
                        )}
                    />

                    <Rows
                        rows={[
                            {
                                field: tr('GENERIC', 'GENERIC'),
                                purpose: tr(
                                    'Puede usar RAG en flujo principal y también en bloqueadores globales LLM. Si `mode=always`, recupera en cada turno; si `by_step`, solo en pasos con `rag_action`.',
                                    'Can use RAG in main flow and in global LLM blockers. If `mode=always`, retrieves each turn; if `by_step`, only on steps with `rag_action`.',
                                ),
                                example: tr('Caso real: con `always` + `top_k=6` + query vaga, sube costo sin valor.', 'Real case: with `always` + `top_k=6` + vague query, cost increases without value.'),
                            },
                            {
                                field: tr('SIMULATOR', 'SIMULATOR'),
                                purpose: tr(
                                    'Comparte runtime principal; RAG se activa por `rag_config` y/o `rag_action` por paso LLM. En pasos SCRIPTED no hay llamada LLM, por lo tanto no hay inyección de evidencia al modelo.',
                                    'Shares main runtime; RAG is triggered by `rag_config` and/or per-step LLM `rag_action`. SCRIPTED steps do not call LLM, so no evidence is injected there.',
                                ),
                                example: tr('Usar `by_step` para reservar RAG a pasos técnicos.', 'Use `by_step` to reserve RAG for technical steps.'),
                            },
                            {
                                field: tr('DETECTOR', 'DETECTOR'),
                                purpose: tr(
                                    'Tiene dos caminos: (a) bloqueadores globales (FlowEngine + LLM) que pueden usar RAG por paso, y (b) runtime de detección por pasos donde RAG puede anexar evidencia a instrucciones del análisis.',
                                    'Has two paths: (a) global blockers (FlowEngine + LLM) with per-step RAG, and (b) detector step runtime where RAG can append evidence into analysis instructions.',
                                ),
                                example: tr('Si ves retrieval correcto sin traza, revisar escritura de metadata/auditoría.', 'If retrieval is correct but trace missing, check metadata/audit write path.'),
                            },
                            {
                                field: tr('EXAMINER', 'EXAMINER'),
                                purpose: tr(
                                    'Usa RAG en bloqueadores LLM del flujo y también en rutas semánticas del examen (validación de respuestas, post-cierre y clasificación asistida).',
                                    'Uses RAG in flow LLM blockers and also in semantic exam routes (answer validation, post-close response, assisted classification).',
                                ),
                                example: tr('Para evaluación estricta, combinar `evaluation_only` + `strict_mode` + criterios claros.', 'For strict grading, combine `evaluation_only` + `strict_mode` + clear criteria.'),
                            },
                            {
                                field: tr('EVALUATOR', 'EVALUATOR'),
                                purpose: tr(
                                    'Corre en acción de evaluación (no en chat normal). Puede recuperar evidencia para `evaluate_conversation` y mezclarla con señales determinísticas de runtime.',
                                    'Runs inside evaluation action (not normal chat). Can retrieve evidence for `evaluate_conversation` and combine it with deterministic runtime signals.',
                                ),
                                example: tr('Si no hay señales runtime, se omite ese bloque en prompt.', 'If runtime signals are absent, that block is omitted from prompt.'),
                            },
                        ]}
                    />

                    <SectionHeading
                        icon={<Settings2 className="h-6 w-6 text-primary" />}
                        title={tr('3. Control de RAG + Opciones avanzadas: cada campo de la UI', '3. RAG control + advanced options: every UI field')}
                        subtitle={tr(
                            'Nombres visuales primero (como aparecen en pantalla) y clave técnica entre paréntesis.',
                            'Visual names first (exactly as shown in UI), with technical key in parentheses.',
                        )}
                    />

                    <Rows
                        rows={[
                            {
                                field: tr('Modo RAG (`rag_config.mode`)', 'RAG Mode (`rag_config.mode`)'),
                                purpose: tr(
                                    '`never`: no retrieval. `always`: retrieval en cada turno. `by_step`: solo si el paso LLM trae `rag_action`. `evaluation_only`: reservado a evaluación/validación.',
                                    '`never`: no retrieval. `always`: retrieval every turn. `by_step`: only if LLM step has `rag_action`. `evaluation_only`: reserved for evaluation/validation.',
                                ),
                                example: tr('Si querés controlar costos, empezá por `by_step`.', 'If you need cost control, start with `by_step`.'),
                            },
                            {
                                field: tr('Motor (`rag_config.owner`)', 'Engine (`rag_config.owner`)'),
                                purpose: tr(
                                    '`wrapper`: recuperación vía SDK con estrategia/fallback/caché propios. `platform`: usa `responses` + `file_search` nativo.',
                                    '`wrapper`: SDK retrieval with custom strategy/fallback/cache. `platform`: native `responses` + `file_search`.',
                                ),
                                example: tr('Wrapper para tuning fino; Platform para operación simple.', 'Use Wrapper for fine tuning; Platform for simpler operations.'),
                            },
                            {
                                field: tr('IDs de Vector Store (`vector_store_ids`)', 'Vector Store IDs (`vector_store_ids`)'),
                                purpose: tr(
                                    'Lista de VS válidos (`vs_...`). Si está vacía con RAG activo, no hay evidencia útil. En `strict_mode` puede responder con fallback seguro.',
                                    'List of valid vector stores (`vs_...`). If empty while RAG is active, there is no useful evidence. In `strict_mode` it may return safe fallback.',
                                ),
                                example: tr('Mantené IDs explícitos y vigentes por entorno.', 'Keep IDs explicit and environment-valid.'),
                            },
                            {
                                field: tr('Evidencia requerida (`strict_mode`)', 'Evidence required (`strict_mode`)'),
                                purpose: tr(
                                    'Si no hay evidencia suficiente, el bot evita inventar y usa respuesta segura. Reduce alucinación, puede aumentar respuestas de no evidencia.',
                                    'If evidence is insufficient, bot avoids hallucinating and uses safe fallback. Reduces hallucinations, may increase no-evidence answers.',
                                ),
                                example: tr('Obligatorio en compliance, seguridad, legal, salud.', 'Mandatory in compliance, safety, legal, healthcare.'),
                            },
                            {
                                field: tr('Top-K / max_num_results', 'Top-K / max_num_results'),
                                purpose: tr(
                                    'Cantidad de fragmentos inyectados. Más alto aumenta cobertura y también ruido/costo/token.',
                                    'Number of injected chunks. Higher values increase coverage but also noise/cost/tokens.',
                                ),
                                example: tr('Rango inicial recomendado: 3 a 5.', 'Recommended starting range: 3 to 5.'),
                            },
                            {
                                field: tr('Umbral de puntaje (`score_threshold`)', 'Score threshold (`score_threshold`)'),
                                purpose: tr(
                                    'Umbral de calidad. Evita inyectar trozos débiles. Es crítico cuando las queries son vagas (ej. "tito").',
                                    'Quality threshold. Prevents weak chunks from being injected. Critical for vague queries (e.g. "tito").',
                                ),
                                example: tr('Partir en 0.50-0.65 y ajustar por recall/precisión.', 'Start at 0.50-0.65 and tune by recall/precision.'),
                            },
                            {
                                field: tr('Estrategia (`wrapper.strategy`)', 'Strategy (`wrapper.strategy`)'),
                                purpose: tr(
                                    '`similarity`, `metadata_first`, `hybrid`. Define orden y fallback interno de búsqueda en wrapper.',
                                    '`similarity`, `metadata_first`, `hybrid`. Defines retrieval order and internal fallback in wrapper.',
                                ),
                                example: tr('Si tenés metadata confiable, `metadata_first` o `hybrid`.', 'If metadata is trustworthy, use `metadata_first` or `hybrid`.'),
                            },
                            {
                                field: tr('Fallback (`wrapper.fallback`)', 'Fallback (`wrapper.fallback`)'),
                                purpose: tr(
                                    '`rewrite_retry`, `secondary_store`, `safe_reply`, `none`. Decide qué hace wrapper si la primera búsqueda no devuelve suficiente.',
                                    '`rewrite_retry`, `secondary_store`, `safe_reply`, `none`. Controls wrapper behavior when first search is insufficient.',
                                ),
                                example: tr('Evitá `none` salvo casos muy controlados.', 'Avoid `none` except in tightly controlled cases.'),
                            },
                            {
                                field: tr('TTL de caché (`wrapper.cache_ttl`)', 'Cache TTL (`wrapper.cache_ttl`)'),
                                purpose: tr(
                                    'Define cuánto tiempo se reutiliza retrieval en caché para query equivalente. Reduce latencia y costo cuando hay repetición.',
                                    'Defines how long equivalent retrieval is reused from cache. Reduces latency and cost under repeated queries.',
                                ),
                                example: tr('Si el contenido cambia mucho, usá TTL más corto.', 'If content changes frequently, use a shorter TTL.'),
                            },
                            {
                                field: tr('Límite de evidencia (`max_evidence_tokens`)', 'Evidence limit (`max_evidence_tokens`)'),
                                purpose: tr(
                                    'Límite de tamaño del evidence pack. Es una palanca directa de costo por request.',
                                    'Evidence pack size cap. Direct lever for per-request cost.',
                                ),
                                example: tr('Si los costos suben, bajá este valor antes que apagar RAG.', 'If costs spike, lower this value before disabling RAG.'),
                            },
                            {
                                field: tr('Filtros de metadatos (`metadata_filters` / `filters`)', 'Metadata filters (`metadata_filters` / `filters`)'),
                                purpose: tr(
                                    'Restringe universo documental (área, producto, país, versión). Es de lo más efectivo para precisión y costo.',
                                    'Restricts document universe (area, product, country, version). One of the strongest precision/cost controls.',
                                ),
                                example: tr('Filtrar por `area=combustibles` evita ruido cross-dominio.', 'Filtering by `area=combustibles` avoids cross-domain noise.'),
                            },
                            {
                                field: tr('force_tool (Platform)', 'force_tool (Platform)'),
                                purpose: tr(
                                    'En owner=platform fuerza uso de herramienta `file_search`. Útil cuando querés garantizar intento de recuperación.',
                                    'In owner=platform, forces `file_search` tool usage. Useful when retrieval attempt must always happen.',
                                ),
                                example: tr('Usar con criterio: forzar herramienta también forzará costo.', 'Use carefully: forcing tool also forces cost.'),
                            },
                            {
                                field: tr('Auditoría (`store_queries`, `store_results`, `store_scores`)', 'Audit (`store_queries`, `store_results`, `store_scores`)'),
                                purpose: tr(
                                    'Controla trazabilidad de auditoría RAG (`rag_traces`). Muy útil para debugging, calidad y compliance.',
                                    'Controls RAG audit traceability (`rag_traces`). Very useful for debugging, quality, and compliance.',
                                ),
                                example: tr('En producción regulada, mantener estas trazas activas.', 'In regulated production, keep these traces enabled.'),
                            },
                        ]}
                    />

                    <SectionHeading
                        icon={<GitBranch className="h-6 w-6 text-primary" />}
                        title={tr('4. RAG por paso (panel visual) y precedencias', '4. Per-step RAG (visual panel) and precedence rules')}
                        subtitle={tr(
                            'Cómo se combinan global y por paso, qué gana en caso de conflicto y cómo diseñar pasos estables.',
                            'How global and per-step settings combine, conflict precedence, and how to design stable steps.',
                        )}
                    />

                    <Rows
                        rows={[
                            {
                                field: tr('RAG por paso -> Activado (`rag_action.enabled`)', 'Per-step RAG -> Enabled (`rag_action.enabled`)'),
                                purpose: tr(
                                    'Activa RAG solo para ese paso LLM. Si `mode=by_step`, esto gobierna la ejecución.',
                                    'Enables RAG only for that LLM step. If `mode=by_step`, this controls execution.',
                                ),
                                example: tr('Paso de saludo OFF; paso de consulta técnica ON.', 'Greeting step OFF; technical query step ON.'),
                            },
                            {
                                field: tr('RAG por paso -> Plantilla de consulta (`rag_action.query_template`)', 'Per-step RAG -> Query Template (`rag_action.query_template`)'),
                                purpose: tr(
                                    'Si existe, reemplaza query por defecto del usuario. Es la palanca más importante de precisión.',
                                    'If present, overrides default user query. This is the strongest precision lever.',
                                ),
                                example: tr('Global blocker "tito" -> query_template fija de promos lunes.', 'Global blocker "tito" -> fixed Monday promotions query_template.'),
                            },
                            {
                                field: tr('RAG por paso -> Propósito / Estrategia / Estricto / Top-K', 'Per-step RAG -> Purpose / Strategy / Strict / Top-K'),
                                purpose: tr(
                                    'Puede sobreescribir parámetros globales para ese paso puntual, sin romper el resto del bot.',
                                    'Can override global parameters for that specific step, without affecting the whole bot.',
                                ),
                                example: tr('Paso crítico: strict=true y top_k bajo para evitar ruido.', 'Critical step: strict=true and low top_k to reduce noise.'),
                            },
                            {
                                field: tr('RAG por paso -> Filtros de metadatos (merge)', 'Per-step RAG -> Metadata Filters (merge)'),
                                purpose: tr(
                                    'Se combinan filtros globales y por paso. Diseñá filtros por capa para no mezclar catálogos incompatibles.',
                                    'Global and step filters are merged. Design layer-wise filters to avoid incompatible catalog mixing.',
                                ),
                                example: tr('Global `pais=AR`, paso `area=combustibles`.', 'Global `pais=AR`, step `area=combustibles`.'),
                            },
                        ]}
                    />

                    <CodeExample
                        title={tr('Ejemplo de configuración robusta por paso', 'Robust per-step configuration example')}
                        code={`{
  "rag_config": {
    "mode": "by_step",
    "owner": "wrapper",
    "strict_mode": true,
    "vector_store_ids": ["vs_..."],
    "wrapper": {
      "top_k": 4,
      "score_threshold": 0.58,
      "max_evidence_tokens": 700,
      "strategy": "hybrid",
      "fallback": "rewrite_retry"
    }
  },
  "global_triggers": [
    {
      "id": "global_paso_1",
      "mode": "LLM",
      "rag_action": {
        "enabled": true,
        "purpose": "context",
        "query_template": "promos combustibles lunes vigentes",
        "top_k": 3,
        "strict": true
      }
    }
  ]
}`}
                    />

                    <SectionHeading
                        icon={<Database className="h-6 w-6 text-primary" />}
                        title={tr('5. Wrapper vs Platform: diferencias reales', '5. Wrapper vs Platform: real differences')}
                        subtitle={tr(
                            'No es solo naming. Cambia API usada, capacidad de tuning y perfil operativo.',
                            'This is not just naming. It changes used API, tuning flexibility, and operational profile.',
                        )}
                    />

                    <Rows
                        rows={[
                            {
                                field: tr('Motor: Wrapper (controlado)', 'Engine: Wrapper (controlled)'),
                                purpose: tr(
                                    'Usa `vectorStores.search`, deduplica, aplica fallback configurable y construye evidence pack controlado.',
                                    'Uses `vectorStores.search`, deduplicates, applies configurable fallback, and builds controlled evidence pack.',
                                ),
                                example: tr('Mejor para tuning fino de costo/precisión.', 'Best for fine-grained cost/precision tuning.'),
                            },
                            {
                                field: tr('Motor: Platform (OpenAI)', 'Engine: Platform (OpenAI)'),
                                purpose: tr(
                                    'Usa `responses` con herramienta `file_search` e incluye resultados de tool call; operación más simple pero con menos knobs propios.',
                                    'Uses `responses` with `file_search` tool and includes tool-call results; simpler operations with fewer custom knobs.',
                                ),
                                example: tr('Bueno para equipos que priorizan simplicidad operativa.', 'Great for teams prioritizing operational simplicity.'),
                            },
                            {
                                field: tr('Caché y aislamiento', 'Cache and isolation'),
                                purpose: tr(
                                    'El cache key contempla owner, stores, query y hash de API key para evitar contaminación entre bots/credenciales.',
                                    'Cache key includes owner, stores, query, and API-key hash to avoid cross-bot/credential contamination.',
                                ),
                                example: tr('Mismo query, distinta key -> distinta entrada de caché.', 'Same query, different key -> different cache entry.'),
                            },
                        ]}
                    />

                    <SectionHeading
                        icon={<ShieldCheck className="h-6 w-6 text-primary" />}
                        title={tr('6. Fiabilidad, seguridad y anti-alucinación', '6. Reliability, safety, and anti-hallucination')}
                        subtitle={tr(
                            'Cómo evitar que el bot "invente" o mezcle evidencia irrelevante.',
                            'How to prevent hallucinations and irrelevant evidence blending.',
                        )}
                    />

                    <Rows
                        rows={[
                            {
                                field: tr('Evidencia requerida / Estricto', 'Evidence required / Strict'),
                                purpose: tr(
                                    'Corta respuesta especulativa cuando no hay evidencia fuerte. Es tu red de seguridad principal.',
                                    'Cuts speculative answers when strong evidence is missing. Main safety net.',
                                ),
                                example: tr('Activalo en dominios críticos.', 'Enable in critical domains.'),
                            },
                            {
                                field: tr('query pobre o ambigua', 'poor or ambiguous query'),
                                purpose: tr(
                                    'Una query vaga trae ruido, aunque RAG funcione técnicamente. Esto impacta precisión y costo.',
                                    'A vague query brings noise even when RAG works technically. This hurts precision and cost.',
                                ),
                                example: tr('Evitar `tito`; preferir query_template con intención completa.', 'Avoid `tito`; prefer full-intent query_template.'),
                            },
                            {
                                field: tr('Top-K alto sin Umbral de puntaje', 'High Top-K without Score Threshold'),
                                purpose: tr(
                                    'Inyecta demasiados fragmentos débiles. Resultado: más tokens, más latencia, respuestas menos estables.',
                                    'Injects too many weak fragments. Result: more tokens, more latency, less stable answers.',
                                ),
                                example: tr('Bajar top_k y subir threshold progresivamente.', 'Lower top_k and raise threshold progressively.'),
                            },
                            {
                                field: tr('Filtros de metadatos', 'Metadata filters'),
                                purpose: tr(
                                    'Reducen universo y evitan contaminación temática. Es la mejora más rentable tras `query_template`.',
                                    'They reduce search universe and prevent topic contamination. Highest ROI after `query_template`.',
                                ),
                                example: tr('Filtrar por área/producto/versión.', 'Filter by area/product/version.'),
                            },
                        ]}
                    />

                    <SectionHeading
                        icon={<Rocket className="h-6 w-6 text-primary" />}
                        title={tr('7. Costos: qué los sube y cómo bajarlos (basado en casos reales)', '7. Costs: what drives them and how to reduce (based on real cases)')}
                        subtitle={tr(
                            'Lecciones prácticas de operación real para evitar que el ahorro por determinismo se pierda por mal tuning de RAG.',
                            'Practical lessons from real operation to avoid losing deterministic savings due to poor RAG tuning.',
                        )}
                    />

                    <Rows
                        rows={[
                            {
                                field: tr('Driver #1: evidence pack', 'Driver #1: evidence pack'),
                                purpose: tr(
                                    'Si `evidence_chars` es alto en trazas, ese bloque domina tokens de entrada.',
                                    'If `evidence_chars` is high in traces, that block dominates input tokens.',
                                ),
                                example: tr('Reducir `top_k`, aplicar `score_threshold`, bajar `max_evidence_tokens`.', 'Reduce `top_k`, apply `score_threshold`, lower `max_evidence_tokens`.'),
                            },
                            {
                                field: tr('Driver #2: history', 'Driver #2: history'),
                                purpose: tr(
                                    'Más historial = más tokens. En conversaciones largas puede superar al prompt base.',
                                    'More history = more tokens. In long conversations it can exceed base prompt.',
                                ),
                                example: tr('Mantener `history_limit` en rango útil para el caso.', 'Keep `history_limit` within case-appropriate range.'),
                            },
                            {
                                field: tr('Driver #3: modo always', 'Driver #3: always mode'),
                                purpose: tr(
                                    '`always` fuerza retrieval en todos los turnos, incluso en turns de baja señal.',
                                    '`always` forces retrieval on every turn, even low-signal turns.',
                                ),
                                example: tr('Preferir `by_step` si no todo el flujo requiere evidencia.', 'Prefer `by_step` if not every flow branch requires evidence.'),
                            },
                            {
                                field: tr('Driver #4: query sin intención', 'Driver #4: query without intent'),
                                purpose: tr(
                                    'Query débil -> baja calidad de matches -> más ruido inyectado -> más costo por respuesta.',
                                    'Weak query -> lower quality matches -> more injected noise -> higher per-response cost.',
                                ),
                                example: tr('Usar query_template explícita en bloqueadores globales.', 'Use explicit query_template in global blockers.'),
                            },
                        ]}
                    />

                    <Callout
                        title={tr('Hallazgo operativo de hoy (importante)', 'Today operational finding (important)')}
                        text={tr(
                            'Se observó retrieval técnicamente correcto con costos altos por evidence pack grande y queries ambiguas. Moraleja: "funciona" no implica "está optimizado". El estándar de calidad debe medir verdad + costo + estabilidad.',
                            'We observed technically correct retrieval with high costs due to large evidence packs and ambiguous queries. Lesson: "it works" does not mean "it is optimized". Quality standard must track truth + cost + stability.',
                        )}
                    />

                    <SectionHeading
                        icon={<ListChecks className="h-6 w-6 text-primary" />}
                        title={tr('8. Recomendaciones por caso de uso (playbooks)', '8. Recommendations by use case (playbooks)')}
                        subtitle={tr(
                            'Configuraciones iniciales sugeridas para acelerar puesta en marcha sin caer en anti-patrones.',
                            'Suggested starting configurations to accelerate rollout while avoiding anti-patterns.',
                        )}
                    />

                    <Rows
                        rows={[
                            {
                                field: tr('Asistente general de soporte', 'General support assistant'),
                                purpose: tr(
                                    'Priorizar robustez y costo balanceado.',
                                    'Prioritize robustness with balanced cost.',
                                ),
                                example: tr('`by_step`, top_k=3, threshold=0.55, strict=true en pasos críticos.', '`by_step`, top_k=3, threshold=0.55, strict=true on critical steps.'),
                            },
                            {
                                field: tr('Compliance / Legal / Seguridad', 'Compliance / Legal / Safety'),
                                purpose: tr(
                                    'Minimizar alucinación, aceptar más rechazos por falta de evidencia.',
                                    'Minimize hallucinations, accept more no-evidence rejections.',
                                ),
                                example: tr('`strict_mode=true`, threshold alto (0.65+), filtros duros.', '`strict_mode=true`, high threshold (0.65+), strict filters.'),
                            },
                            {
                                field: tr('Simulador de entrenamiento', 'Training simulator'),
                                purpose: tr(
                                    'RAG solo en momentos de validación técnica, no en small talk del roleplay.',
                                    'Use RAG only on technical validation moments, not roleplay small talk.',
                                ),
                                example: tr('`mode=by_step` + `rag_action` en pasos de contenido técnico.', '`mode=by_step` + `rag_action` on technical-content steps.'),
                            },
                            {
                                field: tr('Detector con bloqueadores globales', 'Detector with global blockers'),
                                purpose: tr(
                                    'Convertir intents cortos en queries útiles para reducir ruido.',
                                    'Convert short intents into useful queries to reduce noise.',
                                ),
                                example: tr('Trigger "tito" -> query_template "promos lunes combustibles vigentes".', 'Trigger "tito" -> query_template "current Monday fuel promotions".'),
                            },
                            {
                                field: tr('Evaluador académico', 'Academic evaluator'),
                                purpose: tr(
                                    'Separar charla de evaluación documental.',
                                    'Separate chat behavior from documentary grading.',
                                ),
                                example: tr('`evaluation_only` + evidence en `evaluate_conversation`.', '`evaluation_only` + evidence in `evaluate_conversation`.'),
                            },
                            {
                                field: tr('Operación multi-dominio', 'Multi-domain operation'),
                                purpose: tr(
                                    'Evitar cruce de conocimiento entre catálogos incompatibles.',
                                    'Avoid cross-domain leakage between incompatible catalogs.',
                                ),
                                example: tr('Metadata filters por dominio + VS separados.', 'Domain-specific metadata filters + separate vector stores.'),
                            },
                        ]}
                    />

                    <SectionHeading
                        icon={<Wrench className="h-6 w-6 text-primary" />}
                        title={tr('9. Diagnóstico y troubleshooting RAG', '9. RAG diagnostics and troubleshooting')}
                        subtitle={tr(
                            'Cómo leer síntomas y encontrar causa raíz rápido.',
                            'How to read symptoms and find root cause quickly.',
                        )}
                    />

                    <Rows
                        rows={[
                            {
                                field: tr('Síntoma: no dispara bloqueador esperado', 'Symptom: expected blocker does not trigger'),
                                purpose: tr(
                                    'Revisar `trigger_traces`: si hay `matched=true` pero respuesta no cumple intención, problema no es trigger sino query/evidencia del paso LLM.',
                                    'Check `trigger_traces`: if `matched=true` but response misses intent, issue is not trigger matching but LLM step query/evidence.',
                                ),
                                example: tr('Definir `query_template` fija en ese blocker.', 'Define fixed `query_template` on that blocker.'),
                            },
                            {
                                field: tr('Síntoma: RAG trae algo pero mal', 'Symptom: RAG retrieves but answer is wrong'),
                                purpose: tr(
                                    'Analizar scores/top_results en `rag_traces` y calidad semántica de query.',
                                    'Inspect scores/top_results in `rag_traces` and query semantic quality.',
                                ),
                                example: tr('Score bajo repetido -> subir threshold y filtrar metadata.', 'Repeated low scores -> raise threshold and apply metadata filtering.'),
                            },
                            {
                                field: tr('Síntoma: tokens altos', 'Symptom: high tokens'),
                                purpose: tr(
                                    'Mirar `llm_prompt_traces`: `evidence_chars`, `history_chars`, `history_messages`, `prompt_tokens`.',
                                    'Inspect `llm_prompt_traces`: `evidence_chars`, `history_chars`, `history_messages`, `prompt_tokens`.',
                                ),
                                example: tr('Si evidence domina, bajar top_k/max_evidence_tokens.', 'If evidence dominates, lower top_k/max_evidence_tokens.'),
                            },
                            {
                                field: tr('Síntoma: sin trazas', 'Symptom: missing traces'),
                                purpose: tr(
                                    'Confirmar que auditoría está activa y que la persistencia de metadata no pisa `rag_traces`.',
                                    'Confirm audit flags are enabled and metadata persistence is not overwriting `rag_traces`.',
                                ),
                                example: tr('Verificar `audit.store_*` y escritura merge-safe de metadata.', 'Validate `audit.store_*` and merge-safe metadata writes.'),
                            },
                        ]}
                    />

                    <CodeExample
                        title={tr('Checklist de publicación RAG (obligatorio)', 'RAG publication checklist (mandatory)')}
                        code={`1) Modo correcto para el caso (never / always / by_step / evaluation_only).
2) owner definido con intención (wrapper o platform).
3) vector_store_ids válidos y con contenido útil.
4) strict_mode coherente con criticidad del dominio.
5) top_k en rango controlado (3-5 como punto de partida).
6) score_threshold definido si hay ruido.
7) query_template en bloqueadores/steps sensibles.
8) metadata_filters para acotar universo.
9) rag_traces activas para auditoría.
10) prueba real con:
   - consulta válida (debe acertar),
   - consulta ambigua (debe comportarse seguro),
   - medición de tokens/costo en llm_prompt_traces.`}
                    />
                </div>
            ),
        },
        {
            id: 'qa',
            label: tr('8. QA Lab (Laboratorio de calidad)', '8. QA Lab (Quality Lab)'),
            icon: <FlaskConical className="h-4 w-4" />,
            render: () => (
                <div className="space-y-8">
                    <SectionHeading
                        icon={<FlaskConical className="h-8 w-8 text-primary" />}
                        title={tr('Manual operativo del QA Lab (Exhaustivo)', 'QA Lab operational manual (Exhaustive)')}
                        subtitle={tr(
                            'Documento de referencia total del QA Lab. Cada sección, campo, selector, botón, check y estado está explicado con su efecto real en runtime.',
                            'Complete QA Lab reference. Every section, field, selector, button, check, and status is explained with its real runtime effect.',
                        )}
                    />

                    <Callout
                        title={tr('Qué resuelve QA Lab y qué no', 'What QA Lab solves and what it does not')}
                        text={tr(
                            'QA Lab sirve para validar calidad de un bot antes de publicar cambios: funcionalidad, seguridad, regresión, latencia y costo. No reemplaza la prueba de negocio real con usuarios finales; la complementa con evidencia repetible.',
                            'QA Lab validates bot quality before publishing changes: functionality, security, regression, latency, and cost. It does not replace real business testing with end users; it complements it with repeatable evidence.',
                        )}
                    />

                    <Grid>
                        <InfoCard
                            title={tr('Objeto principal: Suite', 'Main object: Suite')}
                            body={tr(
                                'Una Suite agrupa casos de prueba y define umbrales globales (gate) y comportamiento de ejecución (run config). Es tu “contrato de calidad” para un tipo de bot.',
                                'A Suite groups test cases and defines global thresholds (gate) and execution behavior (run config). It is your “quality contract” for a bot type.',
                            )}
                        />
                        <InfoCard
                            title={tr('Objeto principal: Corrida', 'Main object: Run')}
                            body={tr(
                                'Una Corrida ejecuta todos los casos habilitados de una Suite contra un Bot específico. Produce resultados, métricas, estado de gate y artefactos exportables.',
                                'A Run executes all enabled cases of a Suite against a specific Bot. It produces results, metrics, gate status, and exportable artifacts.',
                            )}
                        />
                    </Grid>

                    <Rows
                        rows={[
                            {
                                field: tr('Modelo mental', 'Mental model'),
                                purpose: tr(
                                    'Secuencia oficial: Suite -> Casos -> Corrida -> Resultados -> Diagnóstico -> Ajuste -> Re-corrida -> Publicación.',
                                    'Official sequence: Suite -> Cases -> Run -> Results -> Diagnosis -> Tuning -> Re-run -> Publish.',
                                ),
                                example: tr('No diseñes casos después de correr: primero contrato, luego ejecución.', 'Do not design cases after running: contract first, then execution.'),
                            },
                            {
                                field: tr('Jerarquía de evaluación', 'Evaluation hierarchy'),
                                purpose: tr(
                                    'Caso = PASS/FAIL/ERROR/SKIPPED. Corrida = gate PASSED/FAILED. El gate no “adivina”: evalúa umbrales de pass rate, críticos, seguridad, latencia y costo.',
                                    'Case = PASS/FAIL/ERROR/SKIPPED. Run = gate PASSED/FAILED. Gate does not “guess”: it evaluates thresholds for pass rate, critical failures, security, latency, and cost.',
                                ),
                                example: tr('Podés tener score alto en un caso y aun así FAIL si rompe una regla crítica.', 'A case can have high score and still FAIL if it breaks a critical rule.'),
                            },
                        ]}
                    />

                    <SectionHeading
                        icon={<FlaskConical className="h-6 w-6 text-primary" />}
                        title={tr('1) Panel izquierdo: "QA Lab"', '1) Left panel: "QA Lab"')}
                        subtitle={tr(
                            'Nomenclatura UI exacta y efecto de cada control del panel lateral.',
                            'Exact UI naming and runtime effect of each control on the sidebar.',
                        )}
                    />

                    <Rows
                        rows={[
                            {
                                field: tr('Campo "Cantidad de casos plantilla"', 'Field "Template case count"'),
                                purpose: tr(
                                    'Define cuántos casos crea el botón "Crear plantilla". Rango efectivo: 1 a 1000. Es para bootstrap rápido, no para diseño final.',
                                    'Defines how many cases are created by "Create template". Effective range: 1 to 1000. This is for quick bootstrap, not final design.',
                                ),
                                example: tr('10 para smoke barato, 150 para batería amplia inicial.', '10 for low-cost smoke, 150 for broad initial battery.'),
                            },
                            {
                                field: tr('Aviso "Muchos casos pueden generar alto consumo"', 'Warning "Many cases may generate high usage"'),
                                purpose: tr(
                                    'Al superar 50 casos en plantilla, UI muestra advertencia de consumo/costo para prevenir corridas caras por accidente.',
                                    'When template count exceeds 50, UI shows a usage/cost warning to prevent expensive accidental runs.',
                                ),
                                example: tr('Es advertencia visual, no bloqueo técnico.', 'This is a visual warning, not a technical blocker.'),
                            },
                            {
                                field: tr('Botón "Crear plantilla"', 'Button "Create template"'),
                                purpose: tr(
                                    'Crea Suite + casos de prueba prearmados (FUNCTIONAL, EDGE, SECURITY, REGRESSION) con distribución automática por volumen.',
                                    'Creates Suite + prebuilt test cases (FUNCTIONAL, EDGE, SECURITY, REGRESSION) with automatic distribution by volume.',
                                ),
                                example: tr('Acelera setup inicial, luego debes ajustar casos críticos manualmente.', 'Speeds up initial setup, then you should manually tune critical cases.'),
                            },
                            {
                                field: tr('Botón "Crear suite vacía"', 'Button "Create empty suite"'),
                                purpose: tr(
                                    'Crea solo el contenedor Suite sin casos. Es la opción recomendada cuando ya tienes diseño formal de QA.',
                                    'Creates only the Suite container with no cases. Recommended when you already have formal QA design.',
                                ),
                                example: tr('Úsalo para suites productivas con casos curados por dominio.', 'Use it for production suites with domain-curated cases.'),
                            },
                            {
                                field: tr('Listado de suites (cards)', 'Suite list (cards)'),
                                purpose: tr(
                                    'Muestra nombre de Suite + contador de casos + corridas. Al hacer click, carga contexto de edición en el panel central.',
                                    'Shows Suite name + case count + run count. Clicking loads editing context in the center panel.',
                                ),
                                example: tr('Seleccionar suite cambia inmediatamente "Configuración de suite" y "Casos".', 'Selecting a suite immediately changes "Suite settings" and "Cases".'),
                            },
                        ]}
                    />

                    <SectionHeading
                        icon={<Settings2 className="h-6 w-6 text-primary" />}
                        title={tr('2) Card "Control de corrida"', '2) "Run Control" card')}
                        subtitle={tr(
                            'Consola de ejecución operativa: define contra qué bot y suite corre el batch.',
                            'Operational execution console: defines which bot and suite the batch runs against.',
                        )}
                    />

                    <Rows
                        rows={[
                            {
                                field: 'Select "Bot"',
                                purpose: tr(
                                    'Lista bots disponibles (`name` + `bot_type`). La corrida usa exactamente ese bot para crear sesiones de prueba.',
                                    'Lists available bots (`name` + `bot_type`). Run uses exactly that bot to create test sessions.',
                                ),
                                example: tr('Si el bot no tiene API key, "Iniciar corrida" falla con error.', 'If bot has no API key, "Start run" fails with error.'),
                            },
                            {
                                field: 'Select "Suite"',
                                purpose: tr(
                                    'Selecciona el contrato de pruebas (casos + umbrales) a ejecutar contra el bot elegido.',
                                    'Selects the test contract (cases + thresholds) to execute against the selected bot.',
                                ),
                                example: tr('Si `bot_type_scope` no coincide, la corrida se bloquea.', 'If `bot_type_scope` does not match, run is blocked.'),
                            },
                            {
                                field: tr('Botón "Iniciar corrida"', 'Button "Start run"'),
                                purpose: tr(
                                    'Crea la corrida y sus resultados PENDING para cada caso habilitado. Luego dispara auto-procesamiento por lotes.',
                                    'Creates the run and PENDING results for each enabled case. Then triggers auto batch processing.',
                                ),
                                example: tr('Si la suite tiene >20 casos, pide confirmación previa.', 'If suite has >20 cases, it asks for confirmation first.'),
                            },
                            {
                                field: tr('Botón "Actualizar"', 'Button "Refresh"'),
                                purpose: tr(
                                    'Recarga dashboard, suites, runs y configuración OpenAI QA desde servidor.',
                                    'Reloads dashboard, suites, runs, and OpenAI QA config from server.',
                                ),
                                example: tr('Útil después de corridas largas o cambios desde otra pestaña.', 'Useful after long runs or changes from another tab.'),
                            },
                        ]}
                    />

                    <SectionHeading
                        icon={<ShieldCheck className="h-6 w-6 text-primary" />}
                        title={tr('3) Card "OpenAI QA"', '3) "OpenAI QA" card')}
                        subtitle={tr(
                            'Configuración unificada de credenciales y sincronización con OpenAI Evals.',
                            'Unified credentials and synchronization configuration with OpenAI Evals.',
                        )}
                    />

                    <Rows
                        rows={[
                            {
                                field: tr('Check "Sincronizar corridas con OpenAI Evals"', 'Check "Sync runs to OpenAI Evals"'),
                                purpose: tr(
                                    'Activa/desactiva el envío de runs terminales (`COMPLETED/FAILED/CANCELLED`) a OpenAI Evals.',
                                    'Enables/disables sync of terminal runs (`COMPLETED/FAILED/CANCELLED`) to OpenAI Evals.',
                                ),
                                example: tr('OFF = no sync aunque la corrida termine.', 'OFF = no sync even if run finishes.'),
                            },
                            {
                                field: tr('Input "Prefijo Evals"', 'Input "Evals Name Prefix"'),
                                purpose: tr(
                                    'Prefijo usado al auto-crear Eval remoto en OpenAI. Sirve para ordenar múltiples suites/equipos.',
                                    'Prefix used when auto-creating remote Eval in OpenAI. Useful to organize multiple suites/teams.',
                                ),
                                example: tr('"QA Lab" o "QA Latam Simuladores".', '"QA Lab" or "QA Latam Simulators".'),
                            },
                            {
                                field: tr('Input "Eval ID (opcional)"', 'Input "Eval ID (optional)"'),
                                purpose: tr(
                                    'Si se informa, reutiliza ese Eval remoto exacto. Si queda vacío, intenta resolver por artefactos previos y/o auto-crear.',
                                    'If provided, it reuses that exact remote Eval. If empty, it resolves using prior artifacts and/or auto-create.',
                                ),
                                example: 'eval_abc123',
                            },
                            {
                                field: tr('Check "Auto-crear Eval si no existe"', 'Check "Auto-create Eval when missing"'),
                                purpose: tr(
                                    'Permite crear automáticamente el Eval remoto cuando no hay `Eval ID` ni referencia previa por suite.',
                                    'Allows automatic remote Eval creation when there is no `Eval ID` or previous suite reference.',
                                ),
                                example: tr('Recomendado ON en entornos nuevos.', 'Recommended ON for new environments.'),
                            },
                            {
                                field: tr('Input "OpenAI API Key (Juez + Evals)"', 'Input "OpenAI API Key (Judge + Evals)"'),
                                purpose: tr(
                                    'Clave compartida para juez LLM de QA Lab y sync con OpenAI Evals. Se almacena cifrada en DB.',
                                    'Shared key for QA Lab LLM judge and OpenAI Evals sync. Stored encrypted in DB.',
                                ),
                                example: tr('Si está guardada, se muestra enmascarada hasta usar el botón de ojo.', 'If saved, it is masked until eye button is used.'),
                            },
                            {
                                field: tr('Botón (ojo) mostrar/ocultar', 'Button (eye) show/hide'),
                                purpose: tr(
                                    'Revela la key real solo para admins autorizados y bajo acción explícita.',
                                    'Reveals real key only for authorized admins and explicit action.',
                                ),
                                example: tr('Muestra `sk-...` temporalmente en el input.', 'Temporarily shows `sk-...` in the input.'),
                            },
                            {
                                field: tr('Botón "Guardar OpenAI QA"', 'Button "Save OpenAI QA"'),
                                purpose: tr(
                                    'Persiste toggles/campos y opcionalmente reemplaza key (`set`).',
                                    'Persists toggles/fields and optionally replaces key (`set`).',
                                ),
                                example: tr('Si dejas key vacía pero existe una, mantiene la actual (`keep`).', 'If key is empty but one exists, it keeps current key (`keep`).'),
                            },
                            {
                                field: tr('Botón "Quitar API key"', 'Button "Clear API key"'),
                                purpose: tr(
                                    'Elimina la key guardada (`clear`) de la configuración QA Lab.',
                                    'Removes saved key (`clear`) from QA Lab config.',
                                ),
                                example: tr('Tras confirmar, deja de usar key almacenada en DB.', 'After confirmation, stored DB key is no longer used.'),
                            },
                            {
                                field: tr('Badge "OpenAI Evals" en Corrida', 'Badge "OpenAI Evals" on Run'),
                                purpose: tr(
                                    'Si un run sincronizó, muestra estado, `eval_run_id`, botón "Copiar ID" y "Abrir reporte".',
                                    'If a run synced, it shows status, `eval_run_id`, "Copy ID", and "Open report".',
                                ),
                                example: tr('Permite abrir evidencia remota en OpenAI sin salir del flujo.', 'Lets you open remote OpenAI evidence without leaving workflow.'),
                            },
                        ]}
                    />

                    <SectionHeading
                        icon={<Settings2 className="h-6 w-6 text-primary" />}
                        title={tr('4) Card "Configuración de suite"', '4) "Suite Settings" card')}
                        subtitle={tr(
                            'Parámetros que gobiernan gate global y ejecución del runner.',
                            'Parameters governing global gate and runner execution.',
                        )}
                    />

                    <Rows
                        rows={[
                            {
                                field: tr('Input "Nombre"', 'Input "Name"'),
                                purpose: tr('Nombre operativo visible de la suite.', 'Operational visible suite name.'),
                                example: tr('QA Simulador combustibles - Smoke diario', 'QA Fuel simulator - Daily smoke'),
                            },
                            {
                                field: tr('Input "Alcance por tipo de bot"', 'Input "Bot Type Scope"'),
                                purpose: tr(
                                    'Restringe ejecución por `bot_type`. Si no coincide con el bot, impide iniciar corrida.',
                                    'Restricts execution by `bot_type`. If it does not match selected bot, run cannot start.',
                                ),
                                example: 'SIMULATOR',
                            },
                            {
                                field: tr('Input "Descripción"', 'Input "Description"'),
                                purpose: tr('Contexto de negocio y propósito de la suite.', 'Business context and suite purpose.'),
                                example: tr('Cobertura mínima previa a publicar cambios de flujo.', 'Minimum coverage before publishing flow changes.'),
                            },
                            {
                                field: tr('Input "Pass rate mínimo"', 'Input "Min pass rate"'),
                                purpose: tr(
                                    'Umbral principal de gate. Fórmula: `pass_count / total_cases`.',
                                    'Primary gate threshold. Formula: `pass_count / total_cases`.',
                                ),
                                example: '0.9',
                            },
                            {
                                field: tr('Input "Máx. fallos críticos"', 'Input "Max critical fails"'),
                                purpose: tr(
                                    'Límite de casos CRITICAL en FAIL/ERROR permitidos para gate.',
                                    'Limit of CRITICAL FAIL/ERROR cases allowed for gate.',
                                ),
                                example: '0',
                            },
                            {
                                field: tr('Input "Máx. hallazgos de seguridad"', 'Input "Max security findings"'),
                                purpose: tr(
                                    'Límite total de findings de seguridad detectados en outputs.',
                                    'Total limit of security findings detected in outputs.',
                                ),
                                example: '0',
                            },
                            {
                                field: tr('Input "Máx. latencia promedio (ms)"', 'Input "Max avg latency ms"'),
                                purpose: tr(
                                    'Gate por performance. Compara promedio de latencias de casos procesados.',
                                    'Performance gate. Compares average latency across processed cases.',
                                ),
                                example: '9000',
                            },
                            {
                                field: tr('Input "Máx. costo USD"', 'Input "Max cost USD"'),
                                purpose: tr(
                                    'Gate económico total de la corrida.',
                                    'Total economic gate for the run.',
                                ),
                                example: '5',
                            },
                            {
                                field: tr('Input "Tamaño de lote"', 'Input "Batch size"'),
                                purpose: tr(
                                    'Cuántos resultados PENDING se reclaman por batch en cada iteración del worker.',
                                    'How many PENDING results are claimed per worker batch iteration.',
                                ),
                                example: '20',
                            },
                            {
                                field: tr('Input "Concurrencia"', 'Input "Concurrency"'),
                                purpose: tr(
                                    'Cantidad de casos procesados en paralelo dentro de un batch.',
                                    'Number of cases processed in parallel within a batch.',
                                ),
                                example: '4',
                            },
                            {
                                field: tr('Input "Reintentos"', 'Input "Retries"'),
                                purpose: tr(
                                    'Reintentos por intento de caso cuando hay error transitorio.',
                                    'Retries per case-attempt when transient errors occur.',
                                ),
                                example: '2',
                            },
                            {
                                field: tr('Input "Modelo juez"', 'Input "Judge model"'),
                                purpose: tr(
                                    'Modelo OpenAI usado por el juez LLM (solo casos `judge_mode = LLM` y suite con juez habilitado).',
                                    'OpenAI model used by LLM judge (only cases with `judge_mode = LLM` and suite judge enabled).',
                                ),
                                example: 'gpt-4o-mini',
                            },
                            {
                                field: tr('Input "Temperatura juez"', 'Input "Judge temp"'),
                                purpose: tr('Temperatura para evaluación semántica del juez LLM.', 'Temperature for LLM semantic evaluation.'),
                                example: '0',
                            },
                            {
                                field: tr('Input "Presupuesto USD"', 'Input "Budget USD"'),
                                purpose: tr(
                                    'Presupuesto operativo del run. Si se supera y el check de stop está activo, marca pendientes como SKIPPED.',
                                    'Run operational budget. If exceeded and stop check is active, pending cases become SKIPPED.',
                                ),
                                example: '5',
                            },
                            {
                                field: tr('Check "Evaluar determinístico solo sobre el último mensaje del bot"', 'Check "Run deterministic checks only on the bot last message"'),
                                purpose: tr(
                                    'Controla el scope determinístico: último assistant message o concatenado de todos los assistant messages del intento.',
                                    'Controls deterministic scope: last assistant message or concatenated all assistant messages in the attempt.',
                                ),
                                example: tr('ON recomendado para reducir falsos FAIL por mensajes intermedios.', 'ON recommended to reduce false FAIL from intermediate messages.'),
                            },
                            {
                                field: tr('Check "Habilitar juez LLM para esta suite"', 'Check "Enable LLM Judge for this suite"'),
                                purpose: tr(
                                    'Prende/apaga evaluación semántica LLM en toda la suite. Si OFF, solo determinístico.',
                                    'Enables/disables semantic LLM evaluation across suite. OFF means deterministic-only.',
                                ),
                                example: tr('Útil para smoke barato y estable.', 'Useful for low-cost stable smoke runs.'),
                            },
                            {
                                field: tr('Botón "Guardar suite"', 'Button "Save suite"'),
                                purpose: tr('Persiste gate + run config + metadatos de suite.', 'Persists gate + run config + suite metadata.'),
                                example: tr('Aplícalo antes de iniciar nueva corrida.', 'Apply before starting a new run.'),
                            },
                            {
                                field: tr('Botón "Eliminar suite"', 'Button "Delete suite"'),
                                purpose: tr(
                                    'Elimina suite y todo su historial relacionado (corridas/resultados) por cascada.',
                                    'Deletes suite and its full related history (runs/results) by cascade.',
                                ),
                                example: tr('Usar con extrema precaución en producción.', 'Use with extreme caution in production.'),
                            },
                        ]}
                    />

                    <SectionHeading
                        icon={<FileSearch className="h-6 w-6 text-primary" />}
                        title={tr('5) Card "Casos"', '5) "Cases" card')}
                        subtitle={tr(
                            'Diseño granular de pruebas unitarias conversacionales.',
                            'Granular design of conversational unit tests.',
                        )}
                    />

                    <Rows
                        rows={[
                            {
                                field: tr('Tabla de casos (Nombre/Categoría/Severidad/Modo)', 'Cases table (Name/Category/Severity/Mode)'),
                                purpose: tr(
                                    'Listado navegable de casos de la suite seleccionada. Click en fila abre editor inferior.',
                                    'Navigable list of cases from selected suite. Row click opens lower editor.',
                                ),
                                example: tr('Modo muestra `DETERMINISTIC` o `LLM` por caso.', 'Mode shows `DETERMINISTIC` or `LLM` per case.'),
                            },
                            {
                                field: tr('Botón "Agregar caso"', 'Button "Add case"'),
                                purpose: tr('Crea caso base y lo selecciona para edición inmediata.', 'Creates a base case and selects it for immediate editing.'),
                                example: tr('Nombre inicial: `Case HH:MM:SS`.', 'Initial name: `Case HH:MM:SS`.'),
                            },
                            {
                                field: tr('Botón "Recargar"', 'Button "Reload"'),
                                purpose: tr('Recarga detalle de suite/casos desde DB.', 'Reloads suite/case details from DB.'),
                                example: tr('Útil si hubo edición concurrente por otro admin.', 'Useful when another admin edited concurrently.'),
                            },
                            {
                                field: tr('Input "Nombre del caso"', 'Input "Case name"'),
                                purpose: tr('Identificador humano de la prueba.', 'Human-readable test identifier.'),
                                example: tr('Smoke pago medio', 'Payment method smoke'),
                            },
                            {
                                field: tr('Input "Descripción"', 'Input "Description"'),
                                purpose: tr('Contexto funcional del caso.', 'Functional context of the case.'),
                                example: tr('Valida respuesta estricta al preguntar medio de pago.', 'Validates strict response for payment method prompt.'),
                            },
                            {
                                field: tr('Select "Categoría"', 'Select "Category"'),
                                purpose: tr('Clasificación analítica: FUNCTIONAL, EDGE, SECURITY, REGRESSION.', 'Analytical classification: FUNCTIONAL, EDGE, SECURITY, REGRESSION.'),
                                example: 'SECURITY',
                            },
                            {
                                field: tr('Select "Severidad"', 'Select "Severity"'),
                                purpose: tr('Peso operativo y criticidad de hallazgo: LOW/MEDIUM/HIGH/CRITICAL.', 'Operational weight and finding criticality: LOW/MEDIUM/HIGH/CRITICAL.'),
                                example: 'CRITICAL',
                            },
                            {
                                field: tr('Check "enabled"', 'Check "enabled"'),
                                purpose: tr('Incluye/excluye el caso en nuevas corridas.', 'Includes/excludes case from new runs.'),
                                example: tr('OFF para casos en mantenimiento temporal.', 'OFF for temporarily-maintained cases.'),
                            },
                            {
                                field: tr('Select "Modo de Juez"', 'Select "Judge Mode"'),
                                purpose: tr('Define estrategia por caso: `DETERMINISTIC` o `LLM`.', 'Defines per-case strategy: `DETERMINISTIC` or `LLM`.'),
                                example: tr('SECURITY crítico suele combinar determinístico + LLM.', 'Critical SECURITY often combines deterministic + LLM.'),
                            },
                            {
                                field: tr('Input "cantidad de repeticiones"', 'Input "repeat count"'),
                                purpose: tr('Cantidad de intentos completos del caso para robustez estadística.', 'Number of full case attempts for statistical robustness.'),
                                example: tr('1 para smoke, 2-3 para casos inestables.', '1 for smoke, 2-3 for unstable cases.'),
                            },
                            {
                                field: tr('Input "reintentos máximos"', 'Input "max retries"'),
                                purpose: tr('Reintentos internos por errores transitorios dentro de cada intento.', 'Internal retries for transient errors within each attempt.'),
                                example: tr('2 evita falsos ERROR por timeouts esporádicos.', '2 avoids false ERROR due to sporadic timeouts.'),
                            },
                            {
                                field: tr('Textarea "Rúbrica semántica (opcional)"', 'Textarea "Semantic rubric (optional)"'),
                                purpose: tr('Criterio semántico para juez LLM del caso.', 'Semantic criterion for case LLM judge.'),
                                example: tr('Debe confirmar método de pago sin mencionar descuentos.', 'Must confirm payment method without mentioning discounts.'),
                            },
                            {
                                field: tr('Textarea "Mensajes de entrada (uno por línea)"', 'Textarea "Input messages (one per line)"'),
                                purpose: tr(
                                    'Secuencia exacta de mensajes user enviados al bot en ese caso.',
                                    'Exact sequence of user messages sent to bot for that case.',
                                ),
                                example: tr('Línea 1: "¿Cómo pagás?"', 'Line 1: "How do you pay?"'),
                            },
                            {
                                field: tr('Textarea "Reglas esperadas (JSON)"', 'Textarea "Expected rules (JSON)"'),
                                purpose: tr(
                                    'Contrato determinístico del caso: substrings requeridos/prohibidos, límites de latencia/longitud, validación JSON y checks de seguridad.',
                                    'Deterministic case contract: required/forbidden substrings, latency/length limits, JSON validation, and security checks.',
                                ),
                                example: tr('JSON inválido bloquea guardado del caso.', 'Invalid JSON blocks case save.'),
                            },
                            {
                                field: tr('Botón "Guardar caso"', 'Button "Save case"'),
                                purpose: tr('Persiste definición del caso en DB.', 'Persists case definition in DB.'),
                                example: tr('Siempre guardar antes de correr.', 'Always save before running.'),
                            },
                            {
                                field: tr('Botón "Eliminar caso"', 'Button "Delete case"'),
                                purpose: tr('Elimina el caso seleccionado.', 'Deletes selected case.'),
                                example: tr('Pide confirmación previa.', 'Asks confirmation first.'),
                            },
                        ]}
                    />

                    <CodeExample
                        title={tr('JSON recomendado para "Reglas esperadas"', 'Recommended JSON for "Expected rules"')}
                        code={`{
  "required_substrings": ["Pago con"],
  "forbidden_substrings": ["descuento", "promo", "reintegro"],
  "must_be_json": false,
  "required_json_keys": [],
  "max_latency_ms": 2000,
  "max_response_chars": 120,
  "semantic_rubric": "Responder solo medio de pago, sin beneficios ni topes.",
  "min_semantic_score": 0.85,
  "security_checks": {
    "detect_prompt_leak": true,
    "detect_secret_leak": true,
    "blocklist_patterns": []
  }
}`}
                    />

                    <SectionHeading
                        icon={<Database className="h-6 w-6 text-primary" />}
                        title={tr('6) Card "Corridas"', '6) "Runs" card')}
                        subtitle={tr(
                            'Monitoreo operativo de ejecuciones y controles de exportación.',
                            'Operational monitoring of executions and export controls.',
                        )}
                    />

                    <Rows
                        rows={[
                            {
                                field: tr('Tabla de corridas (Run/Estado/Gate/Pass Rate)', 'Runs table (Run/Status/Gate/Pass Rate)'),
                                purpose: tr(
                                    'Historial de ejecuciones recientes. Seleccionar una fila carga detalle y acciones.',
                                    'Recent execution history. Selecting a row loads detail and actions.',
                                ),
                                example: tr('Run muestra prefijo corto del UUID para lectura rápida.', 'Run shows short UUID prefix for quick reading.'),
                            },
                            {
                                field: tr('Botón "Procesar un lote"', 'Button "Process one batch"'),
                                purpose: tr('Ejecuta una iteración de batch manual.', 'Executes one manual batch iteration.'),
                                example: tr('Útil para control fino y diagnóstico incremental.', 'Useful for fine-grained control and incremental diagnosis.'),
                            },
                            {
                                field: tr('Botón "Auto procesar"', 'Button "Auto process"'),
                                purpose: tr(
                                    'Ejecuta lotes hasta completar o alcanzar límite de seguridad de batches.',
                                    'Runs batches until completion or until safe batch cap is reached.',
                                ),
                                example: tr('Durante ejecución cambia texto a "Procesando...".', 'During execution label changes to "Processing...".'),
                            },
                            {
                                field: tr('Alerta "Auto-proceso detenido por límite de lotes"', 'Alert "Auto processing stopped by batch limit"'),
                                purpose: tr(
                                    'Si se alcanza el máximo interno de batches sin terminar, se detiene para evitar loops infinitos o consumo inesperado.',
                                    'If internal max batches is reached before completion, processing stops to avoid infinite loops or unexpected usage.',
                                ),
                                example: tr('Podés relanzar "Auto procesar" para continuar.', 'You can relaunch "Auto process" to continue.'),
                            },
                            {
                                field: tr('Botón "Cancelar corrida"', 'Button "Cancel run"'),
                                purpose: tr(
                                    'Marca corrida como CANCELLED y pendientes/running como SKIPPED.',
                                    'Marks run as CANCELLED and pending/running items as SKIPPED.',
                                ),
                                example: tr('Usar cuando detectas configuración incorrecta.', 'Use when you detect wrong configuration.'),
                            },
                            {
                                field: tr('Botón "CSV"', 'Button "CSV"'),
                                purpose: tr('Exporta resumen tabular seguro para planilla.', 'Exports tabular summary safe for spreadsheet use.'),
                                example: tr('Incluye neutralización de fórmula para CSV injection.', 'Includes formula neutralization for CSV injection.'),
                            },
                            {
                                field: tr('Botón "JSON"', 'Button "JSON"'),
                                purpose: tr('Exporta detalle estructurado del run.', 'Exports structured run detail.'),
                                example: tr('Útil para análisis técnico automatizado.', 'Useful for automated technical analysis.'),
                            },
                            {
                                field: tr('Bloque de métricas (Procesados / Pass-Fail / Hallazgos / Costo)', 'Metrics block (Processed / Pass-Fail / Findings / Cost)'),
                                purpose: tr(
                                    'Resumen ejecutivo de avance y riesgo de la corrida seleccionada.',
                                    'Executive summary of selected run progress and risk.',
                                ),
                                example: tr('Costo total permite control presupuestario inmediato.', 'Total cost provides immediate budget control.'),
                            },
                            {
                                field: tr('Alerta "El gate de calidad falló"', 'Alert "Quality gate failed"'),
                                purpose: tr('Indica que uno o más umbrales globales fueron violados.', 'Indicates one or more global thresholds were violated.'),
                                example: tr('Consultar siempre "Motivos del gate".', 'Always review "Gate reasons".'),
                            },
                        ]}
                    />

                    <SectionHeading
                        icon={<ListChecks className="h-6 w-6 text-primary" />}
                        title={tr('7) Card "Detalle de corrida"', '7) "Run Detail" card')}
                        subtitle={tr(
                            'Diagnóstico profundo para FAIL/ERROR con foco en causa raíz.',
                            'Deep FAIL/ERROR diagnosis focused on root cause.',
                        )}
                    />

                    <Rows
                        rows={[
                            {
                                field: tr('Filtro implícito de casos', 'Implicit case filter'),
                                purpose: tr('Muestra solo resultados con estado FAIL o ERROR (máximo 12 cards).', 'Shows only FAIL or ERROR results (max 12 cards).'),
                                example: tr('Optimizado para revisión de incidentes, no para PASS masivo.', 'Optimized for incident review, not mass PASS browsing.'),
                            },
                            {
                                field: tr('Badge de estado por caso', 'Per-case status badge'),
                                purpose: tr('Identifica tipo de fallo: FAIL (lógico) o ERROR (ejecución).', 'Identifies failure type: FAIL (logical) or ERROR (execution).'),
                                example: tr('ERROR suele apuntar a fallas técnicas (timeouts, sesión, etc.).', 'ERROR usually points to technical failures (timeouts, session, etc.).'),
                            },
                            {
                                field: tr('Bloque "Checks determinísticos fallidos"', 'Block "Failed deterministic checks"'),
                                purpose: tr(
                                    'Lista reglas determinísticas incumplidas, incluyendo scope (`último mensaje` o `conversación completa`).',
                                    'Lists unmet deterministic rules, including scope (`last message` or `full conversation`).',
                                ),
                                example: tr('Ejemplo: `required_substring:Pago con: Required substring missing.`', 'Example: `required_substring:Pago con: Required substring missing.`'),
                            },
                            {
                                field: tr('`error_message` del resultado', '`error_message` from result'),
                                purpose: tr(
                                    'Si todos los intentos del caso fallaron antes de evaluar reglas, el estado será ERROR con mensaje explícito.',
                                    'If all case attempts failed before rule evaluation, status is ERROR with explicit message.',
                                ),
                                example: tr('`All attempts failed before deterministic evaluation.`', '`All attempts failed before deterministic evaluation.`'),
                            },
                            {
                                field: tr('Bloque "Motivos del gate"', 'Block "Gate reasons"'),
                                purpose: tr('Explica por qué la corrida quedó FAILED a nivel global.', 'Explains why run ended FAILED globally.'),
                                example: tr('`Pass rate 0.50 below minimum 0.90.`', '`Pass rate 0.50 below minimum 0.90.`'),
                            },
                        ]}
                    />

                    <SectionHeading
                        icon={<ClipboardList className="h-6 w-6 text-primary" />}
                        title={tr('8) Lógica de evaluación interna (runtime)', '8) Internal runtime evaluation logic')}
                        subtitle={tr(
                            'Cómo decide QA Lab si un caso pasa/falla y cómo se compone el gate final.',
                            'How QA Lab decides case pass/fail and how final gate is composed.',
                        )}
                    />

                    <CodeExample
                        title={tr('Reglas de decisión (resumen técnico)', 'Decision rules (technical summary)')}
                        code={`Caso:
1) Ejecuta input_messages (uno por línea) en una sesión aislada.
2) Evalúa reglas determinísticas:
   - required_substrings
   - forbidden_substrings
   - must_be_json / required_json_keys
   - max_latency_ms
   - max_response_chars
   - security_checks (prompt/secret leaks, blocklists)
3) Si suite habilita juez LLM y caso está en modo LLM:
   finalScore = (determinístico * 0.5) + (llm * 0.5)
   finalPass  = determinístico && llm
4) Si no hay juez LLM:
   finalScore = determinístico
   finalPass  = determinístico
5) repeat_count:
   pass_threshold = ceil(repeat_count / 2)
   caso PASS si pass_count >= pass_threshold
6) Si no hubo ningún intento evaluable:
   estado = ERROR (no FAIL) con error_message explícito.

Corrida (Gate):
- pass_rate >= min_pass_rate
- critical_failures <= max_critical_failures
- security_findings <= max_security_findings
- avg_latency_ms <= max_avg_latency_ms
- total_cost_usd <= max_total_cost_usd
=> Si cualquier condición falla: gate_status = FAILED`}
                    />

                    <SectionHeading
                        icon={<Rocket className="h-6 w-6 text-primary" />}
                        title={tr('9) Checklist operativo recomendado', '9) Recommended operational checklist')}
                        subtitle={tr(
                            'Secuencia mínima para uso confiable, barato y auditable.',
                            'Minimum sequence for reliable, low-cost, auditable usage.',
                        )}
                    />

                    <Process
                        steps={[
                            tr('1) Definir suite por objetivo (Smoke / Regresión / Seguridad).', '1) Define suite by objective (Smoke / Regression / Security).'),
                            tr('2) Cargar 2-5 casos críticos primero (no arrancar con 150 de una).', '2) Start with 2-5 critical cases first (do not start with 150 at once).'),
                            tr('3) Ejecutar corrida corta y leer "Detalle de corrida".', '3) Run short execution and read "Run Detail".'),
                            tr('4) Corregir reglas/casos según checks fallidos.', '4) Fix rules/cases based on failed checks.'),
                            tr('5) Ajustar umbrales de gate según criticidad real del negocio.', '5) Tune gate thresholds according to real business criticality.'),
                            tr('6) Re-correr suite y confirmar estabilidad en al menos 2 corridas.', '6) Re-run suite and confirm stability across at least 2 runs.'),
                            tr('7) Exportar CSV/JSON para evidencia y decisión de publicación.', '7) Export CSV/JSON as evidence for release decision.'),
                        ]}
                    />

                    <Callout
                        title={tr('Regla de oro de QA Lab', 'QA Lab golden rule')}
                        text={tr(
                            'Un PASS sin diagnóstico claro de FAIL previos no es suficiente. El estándar operativo correcto es: entender por qué falló, ajustar, y demostrar que dejó de fallar por la razón correcta.',
                            'A PASS without clear diagnosis of previous FAIL is not enough. Correct operational standard is: understand why it failed, tune, and prove it stopped failing for the right reason.',
                        )}
                    />
                </div>
            ),
        },
        {
            id: 'pro',
            label: tr('9. Modo Pro', '9. Pro Mode'),
            icon: <Code2 className="h-4 w-4" />,
            render: () => (
                <div className="space-y-8">
                    <SectionHeading
                        icon={<Code2 className="h-8 w-8 text-primary" />}
                        title={tr('Modo Pro sin romper producción', 'Using Pro Mode without breaking production')}
                        subtitle={tr(
                            'El modo pro es poderoso, pero exige disciplina. Es para edición de JSON avanzada.',
                            'Pro mode is powerful, but requires discipline. It is for advanced JSON editing.',
                        )}
                    />

                    <Process
                        steps={[
                            tr('1) Crear snapshot antes de editar.', '1) Create snapshot before editing.'),
                            tr('2) Cambiar una cosa por vez.', '2) Change one thing at a time.'),
                            tr('3) Validar que JSON sea válido y schema-compatible.', '3) Validate JSON and schema compatibility.'),
                            tr('4) Probar en chat y luego en QA Lab.', '4) Test in chat and then in QA Lab.'),
                            tr('5) Publicar solo cuando los resultados estén estables.', '5) Publish only when results are stable.'),
                        ]}
                    />

                    <CodeExample
                        title={tr('Ejemplo de estructura mental', 'Example mental structure')}
                        code={`{
  "identity": {"name": "Simulador X", "type": "SIMULATOR"},
  "orchestration": {"prompt_id": "pmpt_xxx", "model": "gpt-4o"},
  "logic_layer": {
    "session_vars": {...},
    "global_triggers": [...],
    "flow_steps": [...],
    "rag_config": {...}
  }
}`}
                    />
                </div>
            ),
        },
        {
            id: 'troubleshoot',
            label: tr('10. Diagnóstico', '10. Troubleshooting'),
            icon: <Wrench className="h-4 w-4" />,
            render: () => (
                <div className="space-y-8">
                    <SectionHeading
                        icon={<Wrench className="h-8 w-8 text-primary" />}
                        title={tr('Guía de resolución rápida', 'Quick resolution guide')}
                        subtitle={tr(
                            'Cuando algo falla, no improvises. Seguí un orden fijo y vas a encontrar la causa más rápido.',
                            'When something fails, do not improvise. Follow a fixed order and you will find the cause faster.',
                        )}
                    />

                    <Rows
                        rows={[
                            {
                                field: tr('Síntoma: el bot no arranca', 'Symptom: bot does not start'),
                                purpose: tr('Verificar START trigger + API Key + sesión.', 'Check START trigger + API Key + session.'),
                                example: tr('¿Hay al menos un paso START?', 'Is there at least one START step?'),
                            },
                            {
                                field: tr('Síntoma: repite respuesta', 'Symptom: repeated answer'),
                                purpose: tr('Revisar next_step fijo y variables que no cambian.', 'Review fixed next_step and non-changing variables.'),
                                example: tr('INCREMENT no aplicado', 'INCREMENT not applied'),
                            },
                            {
                                field: tr('Síntoma: RAG no trae nada', 'Symptom: RAG returns nothing'),
                                purpose: tr('Validar vector store, modo y query template.', 'Validate vector store, mode, and query template.'),
                                example: tr('modo=never por error', 'mode=never by mistake'),
                            },
                            {
                                field: tr('Síntoma: evaluación inconsistente', 'Symptom: inconsistent evaluation'),
                                purpose: tr('Ajustar criterios y pedir evidencia explícita.', 'Refine criteria and require explicit evidence.'),
                                example: tr('JSON sin razones', 'JSON without reasons'),
                            },
                            {
                                field: tr('Síntoma: no deja publicar', 'Symptom: cannot publish'),
                                purpose: tr('Revisar errores críticos de flujo reportados por linter (regex inválida, next_step inexistente, etc.).', 'Review critical flow-linter errors (invalid regex, missing next_step, etc.).'),
                                example: tr('Guardar permite warnings; publicar no permite críticos.', 'Save allows warnings; publish does not allow critical errors.'),
                            },
                        ]}
                    />

                    <Callout
                        title={tr('Cierre operativo recomendado', 'Recommended operational closure')}
                        text={tr(
                            'Toda mejora importante debería terminar con este ciclo: Snapshot -> Prueba manual -> QA Lab -> Publicación. Si salteás pasos, sube el riesgo.',
                            'Every important improvement should end with this cycle: Snapshot -> Manual test -> QA Lab -> Publish. If you skip steps, risk increases.',
                        )}
                    />
                </div>
            ),
        },
    ];

    const current = sections.find((section) => section.id === activeSection) ?? sections[0];

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-[94vw] lg:max-w-[1400px] bg-card text-card-foreground border border-border shadow-2xl rounded-[2rem] h-[92vh] outline-none p-0 overflow-hidden flex flex-col">
                <div className="bg-muted/60 border-b border-border px-8 py-6 flex-shrink-0">
                    <DialogHeader>
                        <DialogTitle className="text-3xl font-black flex items-center gap-3 text-foreground tracking-tight">
                            <BookOpen className="h-8 w-8 text-primary" /> {t.technical_manual}
                        </DialogTitle>
                        <DialogDescription className="text-muted-foreground font-semibold text-sm mt-2">
                            {tr(
                                'Guía detallada del editor de bots, evaluación, RAG y QA Lab (versión ampliada).',
                                'Detailed guide for bot editor, evaluation, RAG, and QA Lab (extended version).',
                            )}
                        </DialogDescription>
                    </DialogHeader>
                </div>

                <div className="flex flex-1 overflow-hidden">
                    <aside className="w-80 bg-muted/40 border-r border-border p-4 space-y-2 overflow-y-auto">
                        {sections.map((section) => (
                            <button
                                key={section.id}
                                onClick={() => setActiveSection(section.id)}
                                className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-semibold transition-all text-left ${activeSection === section.id
                                    ? 'bg-card text-primary shadow-sm border border-primary/20'
                                    : 'text-muted-foreground hover:bg-card hover:text-foreground'
                                    }`}
                            >
                                {section.icon}
                                <span className="truncate">{section.label}</span>
                            </button>
                        ))}
                    </aside>

                    <main className="flex-1 px-10 py-8 overflow-y-auto bg-background">
                        {current.render()}
                    </main>
                </div>
            </DialogContent>
        </Dialog>
    );
}

function SectionHeading({ icon, title, subtitle }: { icon: ReactNode; title: string; subtitle: string }) {
    return (
        <div className="space-y-3">
            <h3 className="text-3xl font-black text-foreground flex items-center gap-3 tracking-tight">
                {icon}
                {title}
            </h3>
            <p className="text-base text-muted-foreground leading-7 max-w-4xl">{subtitle}</p>
        </div>
    );
}

function Grid({ children }: { children: ReactNode }) {
    return <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">{children}</div>;
}

function InfoCard({ title, body }: { title: string; body: string }) {
    return (
        <div className="p-5 rounded-2xl border border-border bg-card shadow-sm">
            <h4 className="font-bold text-lg text-foreground mb-2 flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-primary" />
                {title}
            </h4>
            <p className="text-sm text-foreground leading-7">{body}</p>
        </div>
    );
}

type RowDef = { field: string; purpose: string; example: string };

function Rows({ rows }: { rows: RowDef[] }) {
    return (
        <div className="rounded-2xl border border-border overflow-hidden bg-card">
            {rows.map((row, idx) => (
                <div
                    key={`${row.field}-${idx}`}
                    className={`grid grid-cols-1 lg:grid-cols-12 gap-3 px-5 py-4 ${idx !== rows.length - 1 ? 'border-b border-border' : ''}`}
                >
                    <div className="lg:col-span-3">
                        <p className="text-sm font-bold text-foreground">{row.field}</p>
                    </div>
                    <div className="lg:col-span-5">
                        <p className="text-sm text-foreground leading-6">{row.purpose}</p>
                    </div>
                    <div className="lg:col-span-4">
                        <p className="text-sm text-primary font-semibold">{row.example}</p>
                    </div>
                </div>
            ))}
        </div>
    );
}

function Process({ steps }: { steps: string[] }) {
    return (
        <div className="space-y-3">
            {steps.map((step, index) => (
                <div key={`${step}-${index}`} className="flex items-start gap-3 p-4 rounded-xl bg-muted/40 border border-border">
                    <div className="h-7 w-7 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center mt-0.5 shrink-0">
                        {index + 1}
                    </div>
                    <p className="text-sm text-foreground leading-7">{step}</p>
                </div>
            ))}
        </div>
    );
}

function Callout({ title, text }: { title: string; text: string }) {
    return (
        <div className="p-5 rounded-2xl border border-primary/20 bg-primary/5">
            <h4 className="text-base font-black text-primary mb-2 flex items-center gap-2">
                <Zap className="h-5 w-5" />
                {title}
            </h4>
            <p className="text-sm text-foreground leading-7">{text}</p>
        </div>
    );
}

function CodeExample({ title, code }: { title: string; code: string }) {
    return (
        <div className="bg-slate-950 dark:bg-slate-950 rounded-2xl p-5 text-slate-50 border border-slate-700 shadow-lg">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-3 flex items-center gap-2">
                <ClipboardList className="h-4 w-4" />
                {title}
            </div>
            <pre className="font-mono text-sm whitespace-pre-wrap leading-7 text-slate-200">{code}</pre>
        </div>
    );
}
