import { AuthProvider, useAuth } from "@/provider/AuthProvider";
import { DataProvider } from "@/provider/DataProvider";
import { Stack } from "expo-router";
import { COLORS } from "../assets/styles/colors";

const InitialLayout = () => {
    const { isAuthenticated } = useAuth();

    return (
        <Stack
            screenOptions={{
                headerShown: false,
                contentStyle: {
                    backgroundColor: COLORS.background,
                },
            }}
        >
            <Stack.Protected guard={isAuthenticated}>
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            </Stack.Protected>

            <Stack.Protected guard={!isAuthenticated}>
                <Stack.Screen name="index" options={{ headerShown: false }} />
            </Stack.Protected>
        </Stack>
    );
};

export default function RootLayout() {
    return (
        <AuthProvider>
            <DataProvider>
                <InitialLayout />
            </DataProvider>
        </AuthProvider>
    );
}