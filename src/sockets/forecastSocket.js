module.exports = (io) => {
    io.on("connection",(socket)=>{
        console.log("Forecast socket connected");

          socket.on("disconnect", () => {

            console.log("Forecast socket disconnected");

        });
    })
}