<?php
// 今のフォルダにあるファイルを表示するだけのシンプルなプログラムだよ
echo "<h3>現在のフォルダ: " . getcwd() . "</h3>";
$files = scandir('.');
echo "<ul>";
foreach ($files as $file) {
    if ($file != "." && $file != "..") {
        echo "<li>" . $file . "</li>";
    }
}
echo "</ul>";
?>