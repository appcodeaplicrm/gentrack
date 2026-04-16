import {
  pgTable,
  serial,
  varchar,
  text,
  boolean,
  timestamp,
  decimal,
  integer,
  jsonb,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// Usuarios
export const usuarios = pgTable("gentrack_usuarios", {
  idUsuario:    serial("idUsuario").primaryKey(),
  nombre:       varchar("nombre", { length: 100 }).notNull(),
  email:        varchar("email", { length: 150 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  rol:          varchar("rol", { length: 20 }).notNull().default("operador"),
  isAdmin:      boolean("is_admin").notNull().default(false),
  activo:       boolean("activo").notNull().default(true),
  createdAt:    timestamp("created_at").defaultNow(),
  updatedAt:    timestamp("updated_at").defaultNow(),
});

// Refresh Tokens
export const refreshTokens = pgTable("gentrack_refresh_tokens", {
  idToken:    serial("idToken").primaryKey(),
  idUsuario:  integer("idUsuario").notNull().references(() => usuarios.idUsuario, { onDelete: "cascade" }),
  token:      varchar("token", { length: 500 }).notNull().unique(),
  expiresAt:  timestamp("expires_at").notNull(),
  createdAt:  timestamp("created_at").defaultNow(),
});

// Push Tokens
export const pushTokens = pgTable("gentrack_push_tokens", {
  idPushToken: serial("idPushToken").primaryKey(),
  idUsuario:   integer("idUsuario").notNull().references(() => usuarios.idUsuario),
  token:       varchar("token", { length: 255 }).notNull().unique(),
  plataforma:  varchar("plataforma", { length: 10 }).notNull(),
  activo:      boolean("activo").notNull().default(true),
  createdAt:   timestamp("created_at").defaultNow(),
  ultimoUso:   timestamp("ultimo_uso"),
});

// Nodos
export const nodos = pgTable("gentrack_nodos", {
  idNodo:      serial("idNodo").primaryKey(),
  nombre:      varchar("nombre", { length: 100 }).notNull().unique(),
  ubicacion:   varchar("ubicacion", { length: 255 }).notNull(),
  descripcion: text("descripcion"),
  activo:      boolean("activo").notNull().default(true),
  createdAt:   timestamp("created_at").defaultNow(),
});

// Api Keys
export const apiKeys = pgTable("gentrack_api_keys", {
  idApiKey:  serial("idApiKey").primaryKey(),
  idNodo:    integer("idNodo").notNull().references(() => nodos.idNodo),
  keyHash:   varchar("key_hash", { length: 255 }).notNull().unique(),
  activo:    boolean("activo").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  ultimoUso: timestamp("ultimo_uso"),
});

// Modelos de Generador
export const generadoresModelos = pgTable("gentrack_generadores_modelos", {
  idModelo:              serial("idModelo").primaryKey(),
  nombre:                varchar("nombre", { length: 100 }).notNull().unique(),
  marca:                 varchar("marca", { length: 50 }).notNull(),
  capacidadGasolina:     decimal("capacidad_gasolina", { precision: 8, scale: 2 }).notNull(),
  consumoGasolinaHoras:  decimal("consumo_gasolina_horas", { precision: 6, scale: 3 }).notNull(),
  intervaloCambioAceite: integer("intervalo_cambio_aceite").notNull(),
  descripcion:           text("descripcion"),
  image_url:              varchar("imagen_url", { length: 500 })
});

// Generadores
export const generadores = pgTable("gentrack_generadores", {
  idGenerador:          serial("idGenerador").primaryKey(),
  idNodo:               integer("idNodo").notNull().unique().references(() => nodos.idNodo),
  idModelo:             integer("idModelo").notNull().references(() => generadoresModelos.idModelo),
  genId:                varchar("gen_id", { length: 50 }).notNull().unique(),
  estado:               varchar("estado", { length: 20 }).notNull().default("apagado"),
  horasTotales:         decimal("horas_totales", { precision: 10, scale: 2 }).notNull().default("0"),
  gasolinaActualLitros: decimal("gasolina_actual_litros", { precision: 6, scale: 2 }).notNull().default("0"),
  encendidoEn:          timestamp("encendido_en"),
  gasolinaSeAcabaEn:    timestamp("gasolina_se_acaba_en"),
  eliminado:            boolean("eliminado").notNull().default(false),
  createdAt:            timestamp("created_at").defaultNow(),
  updatedAt:            timestamp("updated_at").defaultNow(),
});

// Sesiones de Operacion
export const sesionesOperacion = pgTable("gentrack_sesiones_operacion", {
  idSesion:    serial("idSesion").primaryKey(),
  idGenerador: integer("idGenerador").notNull().references(() => generadores.idGenerador),
  idUsuario:   integer("idUsuario").references(() => usuarios.idUsuario),
  idApiKey:    integer("idApiKey").references(() => apiKeys.idApiKey),
  tipoInicio:  varchar("tipo_inicio", { length: 20 }).notNull(),
  inicio:      timestamp("inicio").notNull().defaultNow(),
  fin:         timestamp("fin"),
  horasSesion: integer("horas_sesion"),
  notas:       text("notas"),
});

// Eventos
export const eventos = pgTable("gentrack_eventos", {
  idEvento:    serial("idEvento").primaryKey(),
  idGenerador: integer("idGenerador").notNull().references(() => generadores.idGenerador, { onDelete: 'cascade' }),
  idUsuario:   integer("idUsuario").references(() => usuarios.idUsuario, { onDelete: 'cascade' }),
  idApiKey:    integer("idApiKey").references(() => apiKeys.idApiKey, { onDelete: 'cascade' }),
  tipoEvento:  varchar("tipo_evento", { length: 50 }).notNull(),
  origen:      varchar("origen", { length: 30 }).notNull(),
  metadata:    jsonb("metadata"),
  timestamp:   timestamp("timestamp").notNull().defaultNow(),
});

// Mantenimientos
export const mantenimientos = pgTable("gentrack_mantenimientos", {
  idMantenimiento:         serial("idMantenimiento").primaryKey(),
  idGenerador:             integer("idGenerador").notNull().references(() => generadores.idGenerador),
  idUsuario:               integer("idUsuario").references(() => usuarios.idUsuario, { onDelete: 'cascade' }),
  tipo:                    varchar("tipo", { length: 30 }).notNull(),
  horasAlMomento:          decimal("horas_al_momento", { precision: 10, scale: 2 }),
  gasolinaLitrosAlMomento: decimal("gasolina_litros_al_momento", { precision: 6, scale: 2 }),
  cantidadLitros:          decimal("cantidad_litros", { precision: 6, scale: 2 }),
  imagenUrl:               varchar("imagen_url", { length: 500 }),
  notas:                   text("notas"),
  realizadoEn:             timestamp("realizado_en").notNull().defaultNow(),
});

// Alertas
export const alertas = pgTable("gentrack_alertas", {
  idAlerta:    serial("idAlerta").primaryKey(),
  idGenerador: integer("idGenerador").notNull().references(() => generadores.idGenerador),
  tipo:        varchar("tipo", { length: 50 }).notNull(),
  severidad:   varchar("severidad", { length: 20 }).notNull(),
  leida:       boolean("leida").notNull().default(false),
  generadaEn:  timestamp("generada_en").notNull().defaultNow(),
  leidaEn:     timestamp("leida_en"),
  metadata:    jsonb("metadata"),
});

// Reportes
export const reportes = pgTable("gentrack_reportes", {
  idReporte:   serial("idReporte").primaryKey(),
  idGenerador: integer("idGenerador").notNull().references(() => generadores.idGenerador),
  idUsuario:   integer("idUsuario").references(() => usuarios.idUsuario),
  tipo:        varchar("tipo", { length: 50 }).notNull(),
  datos:       jsonb("datos"),
  desde:       timestamp("desde").notNull(),
  hasta:       timestamp("hasta").notNull(),
  generadoEn:  timestamp("generado_en").notNull().defaultNow(),
});

// Relations
export const usuariosRelations = relations(usuarios, ({ many }) => ({
  refreshTokens:     many(refreshTokens),
  pushTokens:        many(pushTokens),
  sesionesOperacion: many(sesionesOperacion),
  mantenimientos:    many(mantenimientos),
  reportes:          many(reportes),
  eventos:           many(eventos),
}));

export const nodosRelations = relations(nodos, ({ one, many }) => ({
  generador: one(generadores, { fields: [nodos.idNodo], references: [generadores.idNodo] }),
  apiKeys:   many(apiKeys),
}));

export const generadoresRelations = relations(generadores, ({ one, many }) => ({
  nodo:              one(nodos,              { fields: [generadores.idNodo],   references: [nodos.idNodo] }),
  modelo:            one(generadoresModelos, { fields: [generadores.idModelo], references: [generadoresModelos.idModelo] }),
  sesionesOperacion: many(sesionesOperacion),
  eventos:           many(eventos),
  mantenimientos:    many(mantenimientos),
  alertas:           many(alertas),
  reportes:          many(reportes),
}));

export const sesionesOperacionRelations = relations(sesionesOperacion, ({ one }) => ({
  generador: one(generadores, { fields: [sesionesOperacion.idGenerador], references: [generadores.idGenerador] }),
  usuario:   one(usuarios,    { fields: [sesionesOperacion.idUsuario],   references: [usuarios.idUsuario] }),
  apiKey:    one(apiKeys,     { fields: [sesionesOperacion.idApiKey],    references: [apiKeys.idApiKey] }),
}));

export const eventosRelations = relations(eventos, ({ one }) => ({
  generador: one(generadores, { fields: [eventos.idGenerador], references: [generadores.idGenerador] }),
  usuario:   one(usuarios,    { fields: [eventos.idUsuario],   references: [usuarios.idUsuario] }),
  apiKey:    one(apiKeys,     { fields: [eventos.idApiKey],    references: [apiKeys.idApiKey] }),
}));

export const mantenimientosRelations = relations(mantenimientos, ({ one }) => ({
  generador: one(generadores, { fields: [mantenimientos.idGenerador], references: [generadores.idGenerador] }),
  usuario:   one(usuarios,    { fields: [mantenimientos.idUsuario],   references: [usuarios.idUsuario] }),
}));

export const alertasRelations = relations(alertas, ({ one }) => ({
  generador: one(generadores, { fields: [alertas.idGenerador], references: [generadores.idGenerador] }),
}));

export const reportesRelations = relations(reportes, ({ one }) => ({
  generador: one(generadores, { fields: [reportes.idGenerador], references: [generadores.idGenerador] }),
  usuario:   one(usuarios,    { fields: [reportes.idUsuario],   references: [usuarios.idUsuario] }),
}));