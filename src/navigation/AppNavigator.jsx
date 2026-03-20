import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';

import SplashScreen from '../screens/SplashScreen';
import LoginScreen from '../screens/LoginScreen';
import HomeScreen from '../screens/HomeScreen';
import AddReminderScreen from '../screens/AddReminderScreen';
import ReminderListScreen from '../screens/ReminderListScreen';
import ProfileScreen from '../screens/ProfileScreen';

const Stack = createStackNavigator();

const AppNavigator = () => {
   return (
      <NavigationContainer>
         <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Splash" component={SplashScreen} />
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen name="AddReminder" component={AddReminderScreen} />
            <Stack.Screen name="ReminderList" component={ReminderListScreen} />
            <Stack.Screen name="Profile" component={ProfileScreen} />
         </Stack.Navigator>
      </NavigationContainer>
   );
};

export default AppNavigator;