import { View, Text } from 'react-native'
import React from 'react'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { COLORS } from "../assets/styles/colors"

const SafeScreen = ({ children }) => {

    const insents = useSafeAreaInsets()

    return (
        <View style={{paddingTop: insents.top, flex: 1, backgroundColor: COLORS.background }}>
            {children}
        </View>
    )
}

export default SafeScreen