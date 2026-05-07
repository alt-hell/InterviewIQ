import { createSlice } from "@reduxjs/toolkit";


const userSlice = createSlice({
    name:"user",
    initialState:{
        userData: undefined,  // undefined = "not checked yet", null = "confirmed not logged in"
        isLoading: true,
    },
    reducers:{
        setUserData:(state,action)=>{
            state.userData = action.payload
            state.isLoading = false
        }
    }
})

export const {setUserData} = userSlice.actions

export default userSlice.reducer