(function(){
  "use strict";
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!reduce && "IntersectionObserver" in window) {
    var io = new IntersectionObserver(function(en){
      en.forEach(function(x){ if (x.isIntersecting) { x.target.classList.add("in"); io.unobserve(x.target); } });
    }, {threshold:.08, rootMargin:"0px 0px -6% 0px"});
    document.querySelectorAll(".card,.why-item,.step,.qa,.sec-head,.web-demo,.free,.req-cta,.contact").forEach(function(el,i){
      el.classList.add("rv"); el.style.transitionDelay = (i % 3) * 90 + "ms"; io.observe(el);
    });
    setTimeout(function(){ document.querySelectorAll(".rv:not(.in)").forEach(function(el){ var r = el.getBoundingClientRect(); if (r.top < innerHeight) el.classList.add("in"); }); }, 1200);
  }
  var hero = document.querySelector(".hero"), art = document.querySelector(".hero-art");
  if (hero && art && !reduce && matchMedia("(hover:hover)").matches) {
    hero.addEventListener("mousemove", function(e){
      var r = hero.getBoundingClientRect();
      art.style.setProperty("--mx", ((e.clientX - r.left) / r.width - .5).toFixed(3));
      art.style.setProperty("--my", ((e.clientY - r.top) / r.height - .5).toFixed(3));
    });
    hero.addEventListener("mouseleave", function(){ art.style.setProperty("--mx", 0); art.style.setProperty("--my", 0); });
  }
})();
