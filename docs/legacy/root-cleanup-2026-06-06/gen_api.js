const fs=require("fs");const lines=["line1","line2"];fs.writeFileSync("out.txt",lines.join("
"));console.log("done");