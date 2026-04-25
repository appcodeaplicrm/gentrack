const C = {
    reset:  '\x1b[0m',
    purple: '\x1b[38;5;68m',    // [TIPO]           — azul acero medio
    green:  '\x1b[38;5;71m',    // [GASOLINA]       — verde apagado
    amber:  '\x1b[38;5;179m',   // [FILTRO_*]       — dorado seco
    teal:   '\x1b[38;5;73m',    // [ACEITE]         — teal acero
    blue:   '\x1b[38;5;75m',    // [BATERIA][BUJIAS]— azul claro acero
    gray:   '\x1b[38;5;246m',   // [ENCENDIDO]      — gris medio
    red:    '\x1b[38;5;167m',   // [NOTIF]          — rojo ladrillo
    pink:   '\x1b[38;5;110m',   // [SISTEMA]        — azul grisáceo
};

export function tag(color, label) {
    return `${C[color]}[${label}]${C.reset}`;
}