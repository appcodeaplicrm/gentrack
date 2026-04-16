import { useState, useEffect } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    Modal,
    ActivityIndicator,
    Alert,
    ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/provider/AuthProvider';
import { COLORS } from '@/assets/styles/colors';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

interface Nodo   { idNodo: number;   nombre: string; }
interface Modelo { idModelo: number; nombre: string; marca: string; }

interface Props {
    visible:  boolean;
    onClose:  () => void;
    onCreado: () => void;
}

export const NuevoGeneradorModal = ({ visible, onClose, onCreado }: Props) => {
    const { fetchConAuth } = useAuth();

    const [genId,    setGenId]    = useState('');
    const [idNodo,   setIdNodo]   = useState<number | null>(null);
    const [idModelo, setIdModelo] = useState<number | null>(null);
    const [nodos,    setNodos]    = useState<Nodo[]>([]);
    const [modelos,  setModelos]  = useState<Modelo[]>([]);
    const [loading,  setLoading]  = useState(false);

    useEffect(() => {
        if (!visible) return;
        cargarOpciones();
    }, [visible]);

    const cargarOpciones = async () => {
        try {
            const [resNodos, resModelos] = await Promise.all([
                fetchConAuth(`${API_URL}/api/nodos/disponibles`),
                fetchConAuth(`${API_URL}/api/modelos`),
            ]);
            const jsonNodos   = await resNodos.json();
            const jsonModelos = await resModelos.json();
            if (jsonNodos.success)   setNodos(jsonNodos.data);
            if (jsonModelos.success) setModelos(jsonModelos.data);
        } catch (err) {
            console.error('Error cargando opciones:', err);
        }
    };

    const handleCrear = async () => {
        if (!genId.trim() || !idNodo || !idModelo) {
            Alert.alert('Atención', 'Completa todos los campos');
            return;
        }
        try {
            setLoading(true);
            const res  = await fetchConAuth(`${API_URL}/api/generadores`, {
                method: 'POST',
                body:   JSON.stringify({ genId, idNodo, idModelo }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error);

            Alert.alert('Éxito', `${genId} registrado correctamente`);
            setGenId('');
            setIdNodo(null);
            setIdModelo(null);
            onCreado();
            onClose();
        } catch (err: any) {
            Alert.alert('Error', err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={styles.overlay}>
                <View style={styles.sheet}>
                    {/* Handle */}
                    <View style={styles.handle} />

                    <View style={styles.header}>
                        <Text style={styles.title}>Nuevo generador</Text>
                        <TouchableOpacity onPress={onClose}>
                            <Ionicons name="close" size={22} color={COLORS.textMuted} />
                        </TouchableOpacity>
                    </View>

                    <ScrollView showsVerticalScrollIndicator={false}>
                        {/* Gen ID */}
                        <Text style={styles.label}>ID del generador</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="Ej: GEN-011"
                            placeholderTextColor={COLORS.textMuted}
                            value={genId}
                            onChangeText={setGenId}
                            autoCapitalize="characters"
                        />

                        {/* Nodo */}
                        <Text style={styles.label}>Nodo</Text>
                        <View style={styles.optionsRow}>
                            {nodos.map(n => (
                                <TouchableOpacity
                                    key={n.idNodo}
                                    style={[styles.option, idNodo === n.idNodo && styles.optionActive]}
                                    onPress={() => setIdNodo(n.idNodo)}
                                >
                                    <Text style={[styles.optionText, idNodo === n.idNodo && styles.optionTextActive]}>
                                        {n.nombre}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        {/* Modelo */}
                        <Text style={styles.label}>Modelo</Text>
                        <View style={styles.optionsRow}>
                            {modelos.map(m => (
                                <TouchableOpacity
                                    key={m.idModelo}
                                    style={[styles.option, idModelo === m.idModelo && styles.optionActive]}
                                    onPress={() => setIdModelo(m.idModelo)}
                                >
                                    <Text style={[styles.optionText, idModelo === m.idModelo && styles.optionTextActive]}>
                                        {m.nombre}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        {/* Botón */}
                        <TouchableOpacity
                            style={styles.btn}
                            onPress={handleCrear}
                            disabled={loading}
                            activeOpacity={0.8}
                        >
                            {loading
                                ? <ActivityIndicator color="#fff" />
                                : <Text style={styles.btnText}>Registrar generador</Text>
                            }
                        </TouchableOpacity>

                        <View style={{ height: 24 }} />
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex:            1,
        justifyContent:  'flex-end',
        backgroundColor: 'rgba(0,0,0,0.6)',
    },
    sheet: {
        backgroundColor: '#0a1428',
        borderTopLeftRadius:  28,
        borderTopRightRadius: 28,
        padding:          24,
        paddingTop:       12,
        borderWidth:      1,
        borderColor:      'rgba(100,160,255,0.15)',
        maxHeight:        '85%',
    },
    handle: {
        width:           40,
        height:          4,
        borderRadius:    2,
        backgroundColor: 'rgba(255,255,255,0.15)',
        alignSelf:       'center',
        marginBottom:    20,
    },
    header: {
        flexDirection:  'row',
        justifyContent: 'space-between',
        alignItems:     'center',
        marginBottom:   24,
    },
    title: {
        fontSize:   18,
        fontWeight: '700',
        color:      COLORS.textPrimary,
    },
    label: {
        fontSize:      11,
        fontWeight:    '600',
        color:         COLORS.textMuted,
        textTransform: 'uppercase',
        letterSpacing: 0.8,
        marginBottom:  8,
    },
    input: {
        backgroundColor:  'rgba(255,255,255,0.05)',
        borderRadius:     14,
        paddingVertical:  14,
        paddingHorizontal: 16,
        color:            COLORS.textPrimary,
        fontSize:         15,
        borderWidth:      1,
        borderColor:      'rgba(255,255,255,0.08)',
        marginBottom:     20,
    },
    optionsRow: {
        flexDirection: 'row',
        flexWrap:      'wrap',
        gap:           8,
        marginBottom:  20,
    },
    option: {
        paddingHorizontal: 14,
        paddingVertical:   8,
        borderRadius:      20,
        backgroundColor:   'rgba(255,255,255,0.05)',
        borderWidth:       1,
        borderColor:       'rgba(255,255,255,0.08)',
    },
    optionActive: {
        backgroundColor: `${COLORS.primary}22`,
        borderColor:     COLORS.primary,
    },
    optionText: {
        fontSize:   13,
        color:      COLORS.textMuted,
        fontWeight: '500',
    },
    optionTextActive: {
        color:      COLORS.primary,
        fontWeight: '700',
    },
    btn: {
        backgroundColor: COLORS.primary,
        borderRadius:    14,
        paddingVertical: 16,
        alignItems:      'center',
        marginTop:       8,
        shadowColor:     COLORS.primary,
        shadowOpacity:   0.4,
        shadowRadius:    12,
        elevation:       6,
    },
    btnText: {
        color:         '#fff',
        fontSize:      15,
        fontWeight:    '700',
        letterSpacing: 0.5,
    },
});